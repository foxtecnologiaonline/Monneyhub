# MonneyHub

Camadas de infraestrutura compartilhada e produtos MonneyHub — FOX TecnologIA.
Escopo completo em [`docs/`](./docs).

## Fase 0 — Camadas compartilhadas

### Camada A — Gateway WhatsApp / Roteador de Intenção

- `POST /api/webhooks/whatsapp` — webhook único da Meta Business API: valida
  assinatura (`X-Hub-Signature-256`), identifica o tenant pelo
  `phone_number_id`, normaliza e enfileira via BullMQ (`whatsapp-inbound`),
  usando o `wamid` como `jobId` — a Meta reentrega em timeout e a fila
  descarta a duplicata sozinha. Responde rápido (a Meta exige 2xx em poucos
  segundos); todo processamento pesado acontece fora do request.
- `GET /api/webhooks/whatsapp` — handshake de verificação do webhook.
- `npm run worker:whatsapp` — worker que consome a fila, classifica a
  intenção (`src/lib/intent/classify.ts` — Claude com saída estruturada
  quando `ANTHROPIC_API_KEY` está configurada, fallback por keyword quando
  não está ou quando a API falha), despacha pro handler do produto certo
  (`src/lib/handlers/`) e envia a resposta via Graph API.
- Handlers dos 4 produtos conversacionais implementam a interface comum
  `ProductHandler` (`src/lib/handlers/types.ts`). `monneyhub-zap` está
  implementado (Fase 1); `sales-agent`, `normas-ia` e `personai` seguem
  **placeholders** até as fases 2 e 5.

### Camada C — Serviço de Memória/Contexto do Usuário

- Schema Postgres dedicado (`memory`) — não pertence a nenhum produto.
- `GET/PUT /api/memory/:userId` — leitura e escrita (upsert por chave pra
  `PREFERENCE`/`FACT`; `INTERACTION` sempre cria um novo registro).
- `DELETE /api/memory/:userId` — exclusão total e **imediata** (LGPD,
  direito ao esquecimento — não é fila de exclusão adiada).
- API interna, protegida por chave compartilhada (`INTERNAL_API_KEY`) com
  comparação em tempo constante.

Camada B (scoring via SageMaker) fica pra Fase 3, com Radar de Vendas.

## Fase 1 — MonneyHub MEI-Oráculo e MonneyHub Zap

### MEI-Oráculo — previsão de fluxo de caixa

- `npm run worker:forecast` roda dois jobs repetíveis:
  - `weekly-training` (segunda, 03:00): exporta o histórico transacional
    (`src/lib/finance/queries.ts`) pro formato do Amazon Forecast
    (`item_id,timestamp,target_value`), sobe pro S3 e abre o import job.
  - `tick` (15min): avança o pipeline um estágio por vez
    (`IMPORTING → TRAINING → FORECASTING → QUERYING → DONE`) — import, treino
    e geração levam horas, então nenhum job fica bloqueado esperando.
- No estágio final consulta a previsão por usuário, converte fluxo diário em
  **série de saldo** e persiste 90 pontos diários por rodada.
- `GET /api/monneyhub/forecast/:userId?tenantId=…` devolve a previsão como
  **faixa** (pessimista/realista/otimista = P10/P50/P90) em 30/60/90 dias,
  contada a partir de hoje — nunca número único, pra não sugerir precisão
  que o modelo não tem.
- Usuário com menos de 6 meses de histórico fica em `AWAITING_DATA` e recebe
  quantos meses ainda faltam.
- **Alerta proativo**: quando o cenário realista (P50) cruza zero dentro de
  30 dias, um job entra na fila `forecast-alerts` com a data do cruzamento e
  os dias de antecedência (`meetsLeadTimeTarget` marca o critério de aceite
  de 15 dias).
- **MAPE** do preditor é lido do backtest do próprio Forecast e gravado na
  rodada — exposto internamente, nunca prometido ao usuário.

### MonneyHub Zap — assistente financeiro no WhatsApp

Escopo em [`docs/05-monneyhub-zap.md`](./docs/05-monneyhub-zap.md). O handler
(`src/lib/handlers/monneyhub-zap.ts`), plugado no Gateway da Camada A, segue
sempre o mesmo caminho: **classifica → responde → guarda de conteúdo →
disclaimer**.

- **Sub-classificação** (`src/lib/monneyhub-zap/classify.ts`) separa
  `BALANCE` / `STATEMENT` / `FORECAST` (dado interno) de `MARKET` (pergunta
  livre). Determinística por keyword de propósito — é o passo mais barato do
  fluxo e não pode consumir o orçamento de latência da Router API.
- **Dado interno** (`src/lib/finance/queries.ts`) lê saldo, extrato e a
  previsão do MEI-Oráculo. Saldo é **derivado** da soma das transações, não
  materializado na conta — nunca diverge do extrato. Valores em `Decimal`,
  não float.
- **Dado de mercado** (`src/lib/perplexity/router.ts`) consulta a Perplexity
  Router API. Endpoint e modelo configuráveis por env.
- **Guarda de conteúdo** (`src/lib/safety/content-safety.ts`) — Azure AI
  Content Safety em **toda** resposta antes de enviar. Quando o serviço não
  responde: texto gerado por modelo é bloqueado (*fail closed*), texto que
  montamos a partir do banco/MEI-Oráculo passa (*fail open*) — é template
  nosso, não saída de LLM. Sem credencial: passa em dev, **bloqueia em
  produção**.
- **Disclaimer** (`src/lib/monneyhub-zap/disclaimer.ts`) carimba "não é
  recomendação de investimento" quando a resposta **ou a pergunta** encosta
  em investimento. Padrão deliberadamente largo: falso positivo custa uma
  linha, falso negativo custa exposição regulatória.

Critérios de aceite do escopo, e onde estão cobertos:

| Critério | Onde |
| --- | --- |
| 100% das respostas que mencionam investimento levam o disclaimer | `tests/monneyhub-zap-disclaimer.test.ts` |
| Latência < 5s incluindo Router API | orçamento explícito no handler: Router 3000ms + Content Safety 1200ms, via `AbortSignal.timeout` |
| Erro percentual médio (MAPE) documentado e exposto internamente | `ForecastRun.mape`, lido do backtest do Forecast |
| Alerta de saldo negativo com ≥ 15 dias de antecedência | `meetsLeadTimeTarget` em `NegativeBalanceAlert` |

Fora de escopo no v1, conforme os docs: transação financeira real (PIX,
pagamento) e recomendação automática de ação financeira.

## Setup

```bash
npm install
cp .env.example .env   # preencha as credenciais
npx prisma generate
npx prisma migrate deploy
npm run prisma:seed    # cria um tenant + conta de exemplo pra testar localmente
```

Os recursos do Amazon Forecast (dataset, dataset group e role IAM) são
**infraestrutura**, não runtime da aplicação: crie-os uma vez e informe os
ARNs por env (ver `.env.example`).

## Rodando

```bash
npm run dev             # Next.js (webhooks + APIs internas)
npm run worker:whatsapp # gateway: classificação, despacho e resposta
npm run worker:forecast # MEI-Oráculo: treino semanal + tick do pipeline
```

## Qualidade

```bash
npm run typecheck
npm run lint
npm test                # testes unitários, sem infra
npm run smoke           # smoke de integração: precisa de Postgres e Redis reais
```

`npm run smoke` (`scripts/smoke-integration.ts`) exercita o caminho real
ponta a ponta — identificação de tenant, dedup da fila, saldo, gate de
histórico, faixa de previsão, alerta de saldo negativo, handler do Zap e o
ciclo completo da memória incluindo a exclusão LGPD. Ele cria e remove os
próprios dados.

## Variáveis de ambiente

Ver [`.env.example`](./.env.example): `DATABASE_URL`, `REDIS_URL`,
`META_WEBHOOK_VERIFY_TOKEN`, `META_APP_SECRET`, `META_ACCESS_TOKEN`,
`ANTHROPIC_API_KEY`, `INTERNAL_API_KEY`, `AWS_REGION`, `FORECAST_S3_BUCKET`,
`FORECAST_DATASET_ARN`, `FORECAST_DATASET_GROUP_ARN`, `FORECAST_ROLE_ARN`,
`PERPLEXITY_API_KEY`, `PERPLEXITY_BASE_URL`, `PERPLEXITY_MODEL`,
`AZURE_CONTENT_SAFETY_ENDPOINT`, `AZURE_CONTENT_SAFETY_KEY`,
`AZURE_CONTENT_SAFETY_BLOCK_SEVERITY`.

## Débito técnico conhecido (sinalizado, não bloqueia a entrega)

- **Faixa por soma acumulada de quantis.** Somar o P10 diário não é o P10
  estatístico do saldo acumulado (os erros diários não são perfeitamente
  correlacionados). É a aproximação usual e coerente com o propósito da
  faixa — comunicar incerteza, não cravar percentil. Documentado em
  `src/lib/monneyhub/forecast/bands.ts`.
- **Provisionamento de tenant e conta é manual** (`prisma:seed` ou Prisma
  Studio). Não há endpoint/admin ainda pra cadastrar tenant ou vincular
  número de WhatsApp a conta — o handler responde "conta não encontrada"
  quando o `wa_id` não bate com nenhuma. Cadastro real fica pra quando o
  MonneyHub Zap precisar onboardar tenants de verdade.
- **Classificação financeira do Zap é por palavra-chave.** Escolha
  consciente pela latência; se a precisão do roteamento virar problema, o
  caminho é um classificador dedicado, não encadear mais uma chamada de LLM
  no caminho crítico.
- **Latência de 5s é orçada, não medida.** Os timeouts do handler garantem o
  teto por construção, mas ainda não há medição ponta a ponta com a Router
  API real — fica pra validação em staging.
- **Formato da Perplexity Router API assumido como compatível com
  `chat/completions`.** Base URL e modelo são env justamente por isso: se a
  rota real divergir, é configuração, não reescrita. Confirmar contra a conta
  real antes de produção.
- **Sem teste automatizado dos caminhos AWS/Azure/Perplexity.** O smoke cobre
  Postgres e Redis reais; as integrações externas são exercitadas só por
  mock. Um ambiente de staging com credenciais fecharia essa lacuna.
