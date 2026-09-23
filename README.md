# MonneyHub

Camadas de infraestrutura compartilhada e produtos MonneyHub — FOX TecnologIA.
Escopo completo em [`docs/`](./docs).

## Fase 0 — Camadas compartilhadas

### Camada A — Gateway WhatsApp / Roteador de Intenção

- `POST /api/webhooks/whatsapp` — webhook único da Meta Business API: valida
  assinatura (`X-Hub-Signature-256`), deduplica reentrega por `wamid`
  (`claimWhatsAppMessage`, `SET NX` atômico no Redis — cobre corrida entre
  réplicas do webhook, não só timeout), identifica o tenant pelo
  `phone_number_id` em lote e enfileira via BullMQ (`whatsapp-inbound`), com
  o `wamid` também como `jobId` da fila (segunda camada de defesa). Responde
  rápido (a Meta exige 2xx em poucos segundos); todo processamento pesado
  acontece fora do request.
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

Escopo em [`docs/04-monneyhub-mei-oraculo.md`](./docs/04-monneyhub-mei-oraculo.md).
`src/lib/mei-oraculo/`:

- **Série diária** (`series.ts`) — agrega as transações da conta em fluxo
  líquido por dia; dias sem lançamento entram como zero de propósito (sem
  isso a variância sairia subestimada, e é a variância que abre a faixa
  P10/P90). `hasEnoughHistory` aplica o gate de 6 meses.
- **Previsão** (`forecast.ts`) — baseline de passeio aleatório com deriva:
  projeção em *t* dias tem média *t·μ* e desvio *√t·σ*, o que abre a faixa
  com o horizonte (90 dias é mais incerto que 30, por construção). Fica
  atrás de uma interface pequena de propósito — ver débito técnico abaixo.
- **Alerta** (`alert.ts`) — dispara quando o caminho **mediano** (P50, não
  o pessimista) cruza zero dentro de 30 dias.
- **Backtest** (`backtest.ts`) — corta os últimos 30 dias do histórico,
  prevê a partir do corte e compara com o que realmente aconteceu. É o que
  mede o MAPE de verdade (não estimado) e valida a antecedência do alerta
  contra dado real, não só contra a lógica.
- **Export** (`export.ts`) — sobe o histórico em CSV pro S3 (ou qualquer
  S3-compatível, incluindo R2) quando `FORECAST_EXPORT_BUCKET` está
  configurado; sem o bucket, a previsão roda normal e só o export é pulado.
- **Serviço** (`service.ts`) — `buildForecastReport` monta o relatório
  (`NO_ACCOUNT` / `INSUFFICIENT_HISTORY` / `OK`) e `persistForecastRun`
  grava a rodada, com MAPE, para expor a precisão internamente.
- `npm run worker:forecast` (`forecast-weekly.worker.ts`) — roda toda conta,
  persiste a rodada e enfileira (`forecast-alert`) quando há alerta.
- `npm run worker:forecast-alert` (`forecast-alert.worker.ts`) — consome a
  fila `forecast-alert` e entrega o aviso por WhatsApp via Graph API. Worker
  separado do Gateway de propósito: fila e cadência diferentes (job semanal
  vs. mensagem em tempo real), e uma falha aqui não pode derrubar o
  atendimento conversacional.
- `GET /api/forecast/:userId?tenantId=…` devolve o relatório completo —
  sempre **faixa** (P10/P50/P90) em 30/60/90 dias, nunca número único.

> **Decisão de arquitetura a confirmar.** O doc de escopo nomeia Amazon
> Forecast como provedor. A previsão foi implementada como baseline
> estatístico local atrás de uma função única (`forecastBalance`), não
> acoplada ao serviço gerenciado: assim o produto funciona e tem MAPE
> medível hoje, e trocar pelo modelo gerenciado é só substituir essa função.
> Vale confirmar a disponibilidade do Amazon Forecast pra conta nova antes
> de fechar a decisão — se não estiver disponível, o SageMaker da Camada B
> (Fase 3) atende sem mudar o produto em volta.

### MonneyHub Zap — assistente financeiro no WhatsApp

Escopo em [`docs/05-monneyhub-zap.md`](./docs/05-monneyhub-zap.md). O handler
(`src/lib/handlers/monneyhub-zap.ts`), plugado no Gateway da Camada A, segue
sempre o mesmo caminho: **classifica → responde → guarda de conteúdo →
disclaimer**.

- **Sub-classificação** (`src/lib/monneyhub-zap/classify.ts`) separa
  `BALANCE` / `STATEMENT` / `FORECAST` (dado interno) de `MARKET` (pergunta
  livre). Determinística por keyword de propósito — é o passo mais barato do
  fluxo e não pode consumir o orçamento de latência da Router API.
- **Dado interno** (`src/lib/finance/queries.ts`) lê saldo e extrato. Saldo
  é **derivado** da soma das transações, não materializado na conta — nunca
  diverge do extrato. Valores em `Decimal`, não float.
- **Previsão** vem do MEI-Oráculo (`buildForecastReport`) — nunca da Router
  API: é pergunta sobre o caixa do próprio usuário.
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
| Erro percentual médio (MAPE) documentado e exposto internamente | `ForecastRun.mape`, medido por backtest real (`tests/mei-oraculo-backtest.test.ts`) |
| Alerta de saldo negativo com ≥ 15 dias de antecedência | `meetsLeadRequirement` em `BacktestResult`, validado contra histórico real |
| Alerta entregue ao usuário, não só detectado | `src/workers/forecast-alert.worker.ts` — consome `forecast-alert` e envia via Graph API |

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

## Rodando

```bash
npm run dev                   # Next.js (webhook + APIs internas)
npm run worker:whatsapp       # gateway: classificação, despacho e resposta
npm run worker:forecast       # MEI-Oráculo: roda a previsão de todas as contas
npm run worker:forecast-alert # entrega o alerta de saldo negativo por WhatsApp
```

## Qualidade

```bash
npm run typecheck
npm run lint
npm test                # testes unitários, sem infra
npm run smoke           # smoke de integração: precisa de Postgres e Redis reais
```

`npm run smoke` (`scripts/smoke-integration.ts`) exercita o caminho real
ponta a ponta — identificação de tenant, dedup da mensagem (Redis + fila),
saldo, gate de histórico, faixa de previsão, alerta de saldo negativo,
handler do Zap e o ciclo completo da memória incluindo a exclusão LGPD. Ele
cria e remove os próprios dados.

## Variáveis de ambiente

Ver [`.env.example`](./.env.example): `DATABASE_URL`, `REDIS_URL`,
`META_WEBHOOK_VERIFY_TOKEN`, `META_APP_SECRET`, `META_ACCESS_TOKEN`,
`ANTHROPIC_API_KEY`, `INTERNAL_API_KEY`, `PERPLEXITY_API_KEY`,
`PERPLEXITY_BASE_URL`, `PERPLEXITY_MODEL`, `AZURE_CONTENT_SAFETY_ENDPOINT`,
`AZURE_CONTENT_SAFETY_KEY`, `AZURE_CONTENT_SAFETY_BLOCK_SEVERITY`,
`FORECAST_EXPORT_BUCKET`, `AWS_REGION`, `S3_ENDPOINT`.

## Débito técnico conhecido (sinalizado, não bloqueia a entrega)

- **MEI-Oráculo usa baseline estatístico local, não Amazon Forecast.** O doc
  de escopo nomeia Amazon Forecast como provedor; a implementação atual é um
  passeio aleatório com deriva (`forecast.ts`), rodando em processo, sem
  depender de infra AWS provisionada. Decisão deliberada pra ter o produto
  funcionando e testável hoje — `forecastBalance()` é a única função que
  precisa trocar para plugar um modelo gerenciado (Forecast/SageMaker)
  quando a decisão de fornecedor fechar; o resto do produto (série, alerta,
  backtest, persistência, handler) não muda.
- **Provisionamento de tenant e conta é manual** (`prisma:seed` ou Prisma
  Studio). Não há endpoint/admin ainda pra cadastrar tenant ou vincular
  número de WhatsApp a conta — o handler responde "conta não encontrada"
  quando o `wa_id` não bate com nenhuma.
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
- **Sem teste automatizado dos caminhos Azure/Perplexity/S3 reais.** O smoke
  cobre Postgres e Redis reais; essas três integrações são exercitadas só
  por mock. Um ambiente de staging com credenciais fecharia essa lacuna.
