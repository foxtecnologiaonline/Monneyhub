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
- Handlers de `sales-agent`, `normas-ia` e `personai` seguem **placeholders**
  até as fases 2 e 5; todos implementam a mesma interface `ProductHandler`
  (`src/lib/handlers/types.ts`).

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
  - `weekly-training` (segunda, 03:00): exporta o histórico transacional pro
    formato do Amazon Forecast (`item_id,timestamp,target_value`), sobe pro
    S3 e abre o import job.
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

Handler plugado no Gateway da Camada A (`src/lib/handlers/monneyhub-zap.ts`):

- Classifica a pergunta em `BALANCE` / `STATEMENT` / `FORECAST` / `MARKET`
  por palavra-chave — sem mais um ida-e-volta de LLM, porque o alvo é
  resposta em menos de 5s ponta a ponta.
- Saldo, extrato e previsão saem do Postgres; pergunta aberta de mercado vai
  pra **Perplexity Router API** (timeout de 3,5s, com resposta de fallback se
  falhar — o usuário sempre recebe algo).
- Toda resposta passa por **Azure AI Content Safety** antes de sair; acima do
  limiar de severidade, a resposta é trocada por uma mensagem neutra.
- Resposta que toca em investimento carrega sempre o disclaimer
  "Isto não é recomendação de investimento" (idempotente, sem duplicar).

Fora do escopo v1, conforme o documento: transação financeira real (PIX,
pagamento) e recomendação automática de ação financeira.

## Setup

```bash
npm install
cp .env.example .env   # preencha as credenciais
npx prisma generate
npx prisma migrate deploy
npm run prisma:seed    # cria um tenant de exemplo pra testar o webhook local
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
npm test                # 76 testes unitários, sem infra
npm run smoke           # smoke de integração: precisa de Postgres e Redis reais
```

`npm run smoke` (`scripts/smoke-integration.ts`) exercita o caminho real
ponta a ponta — identificação de tenant, dedup da fila, saldo, gate de
histórico, faixa de previsão, alerta de saldo negativo, handler do Zap e o
ciclo completo da memória incluindo a exclusão LGPD. Ele cria e remove os
próprios dados.

## Variáveis de ambiente

Ver [`.env.example`](./.env.example).

## Débito técnico conhecido (sinalizado, não bloqueia a entrega)

- **Faixa por soma acumulada de quantis.** Somar o P10 diário não é o P10
  estatístico do saldo acumulado (os erros diários não são perfeitamente
  correlacionados). É a aproximação usual e coerente com o propósito da
  faixa — comunicar incerteza, não cravar percentil. Documentado em
  `src/lib/monneyhub/forecast/bands.ts`.
- **Provisionamento de tenant é manual** (`prisma:seed` ou Prisma Studio).
  Cadastro real entra quando o primeiro produto precisar onboardar tenants.
- **Classificação financeira do Zap é por palavra-chave.** Escolha
  consciente pela latência; se a precisão do roteamento virar problema, o
  caminho é um classificador dedicado, não encadear mais uma chamada de LLM
  no caminho crítico.
- **Sem teste automatizado dos caminhos AWS/Azure/Perplexity.** O smoke cobre
  Postgres e Redis reais; as integrações externas são exercitadas só por
  mock. Um ambiente de staging com credenciais fecharia essa lacuna.
