# MonneyHub

Camadas de infraestrutura compartilhada e produtos MonneyHub — FOX TecnologIA.
Escopo completo em [`docs/`](./docs).

## Fase 0 — Camadas compartilhadas (implementado)

### Camada A — Gateway WhatsApp / Roteador de Intenção

- `POST /api/webhooks/whatsapp` — webhook único da Meta Business API: valida
  assinatura (`X-Hub-Signature-256`), identifica o tenant pelo
  `phone_number_id`, normaliza e enfileira via BullMQ (`whatsapp-inbound`).
  Responde rápido (a Meta exige 2xx em poucos segundos) — todo processamento
  pesado acontece fora do request.
- `GET /api/webhooks/whatsapp` — handshake de verificação do webhook.
- `npm run worker:whatsapp` — worker que consome a fila, classifica a
  intenção (`src/lib/intent/classify.ts` — Claude quando `ANTHROPIC_API_KEY`
  está configurada, fallback por keyword quando não está), despacha pro
  handler do produto certo (`src/lib/handlers/`) e envia a resposta de volta
  via Graph API.
- Handlers dos 4 produtos conversacionais (`sales-agent`, `monneyhub-zap`,
  `normas-ia`, `personai`) implementam a interface comum `ProductHandler`
  (`src/lib/handlers/types.ts`). `monneyhub-zap` está implementado (Fase 1);
  os outros três seguem placeholders até a fase do roadmap correspondente.

### Camada C — Serviço de Memória/Contexto do Usuário

- Schema Postgres dedicado (`memory`, ver `prisma/schema.prisma`) — não
  pertence a nenhum produto específico.
- `GET/PUT /api/memory/:userId` — leitura e escrita (upsert por chave pra
  `PREFERENCE`/`FACT`; `INTERACTION` sempre cria um novo registro).
- `DELETE /api/memory/:userId` — exclusão total e **imediata** (LGPD,
  direito ao esquecimento — não é uma fila de exclusão adiada).
- API interna, protegida por chave compartilhada (`INTERNAL_API_KEY`), não
  por login de usuário final.

Camada B (client/job runner de Scoring via SageMaker) fica pra Fase 3,
quando Radar de Vendas entra em jogo — conforme a ordem de execução do
roadmap.

## Fase 1 — MonneyHub Zap (implementado)

Escopo em [`docs/05-monneyhub-zap.md`](./docs/05-monneyhub-zap.md). O handler
(`src/lib/handlers/monneyhub-zap.ts`) recebe a mensagem já normalizada do
Gateway e segue sempre o mesmo caminho: **classifica → responde → guarda de
conteúdo → disclaimer**.

- **Sub-classificação** (`src/lib/monneyhub-zap/classify.ts`) separa
  `BALANCE` / `STATEMENT` (dado interno) de `MARKET` (pergunta livre).
  Determinística por keyword de propósito — é o passo mais barato do fluxo e
  não pode consumir o orçamento de latência da Router API.
- **Dado interno** (`src/lib/finance/queries.ts`) lê saldo e lançamentos do
  schema `finance` (Postgres). Valores em `Decimal`, não float.
- **Dado de mercado** (`src/lib/perplexity/router.ts`) consulta a Perplexity
  Router API. Endpoint e modelo são configuráveis por env.
- **Guarda de conteúdo** (`src/lib/safety/content-safety.ts`) — Azure AI
  Content Safety em **toda** resposta antes de enviar. Quando o serviço não
  responde: texto gerado por modelo é bloqueado (*fail closed*), texto que
  montamos a partir do banco passa (*fail open*) — é template nosso, não
  saída de LLM. Sem credencial: passa em dev, **bloqueia em produção**.
- **Disclaimer** (`src/lib/monneyhub-zap/disclaimer.ts`) carimba
  "não é recomendação de investimento" quando a resposta **ou a pergunta**
  encosta em investimento. O padrão é um superconjunto deliberado: falso
  positivo custa uma linha, falso negativo custa exposição regulatória.

Critérios de aceite do escopo, e onde estão cobertos:

| Critério | Onde |
| --- | --- |
| 100% das respostas que mencionam investimento levam o disclaimer | `tests/monneyhub-zap-disclaimer.test.ts` |
| Latência < 5s incluindo Router API | orçamento explícito no handler: Router 3000ms + Content Safety 1200ms, via `AbortSignal.timeout` |

Fora de escopo no v1, conforme o doc: transação financeira real (PIX,
pagamento) — só consulta e informação.

## Setup

```bash
npm install
cp .env.example .env   # preencha as credenciais
npx prisma generate
npx prisma migrate dev --name init
npm run prisma:seed    # cria um tenant de exemplo pra testar o webhook local
```

## Rodando

```bash
npm run dev             # Next.js (webhook + API de memória)
npm run worker:whatsapp # worker BullMQ (classificação + despacho + resposta)
```

## Qualidade

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Variáveis de ambiente

Ver [`.env.example`](./.env.example): `DATABASE_URL`, `REDIS_URL`,
`META_WEBHOOK_VERIFY_TOKEN`, `META_APP_SECRET`, `META_ACCESS_TOKEN`,
`ANTHROPIC_API_KEY`, `INTERNAL_API_KEY`, `PERPLEXITY_API_KEY`,
`AZURE_CONTENT_SAFETY_ENDPOINT`, `AZURE_CONTENT_SAFETY_KEY`.

## Débito técnico conhecido (sinalizado, não bloqueia a entrega)

- **Sem deduplicação de mensagem.** A Meta pode reentregar um webhook em
  caso de timeout/erro; hoje não há checagem pelo `wamid` antes de
  enfileirar. Baixo risco por ora (resposta rápida reduz retries), mas vira
  necessário assim que o volume real começar.
- **Provisionamento de tenant é manual** (`prisma:seed` ou Prisma Studio).
  Não há endpoint/admin ainda pra cadastrar um novo tenant — cadastro real
  fica pra quando o primeiro produto (MonneyHub Zap, Fase 1) precisar
  onboardar tenants de verdade.
- **Sem testes de integração** contra Postgres/Redis reais — os testes
  unitários (`npm test`) cobrem a lógica pura (normalização, classificação,
  roteamento, serviço de memória, MonneyHub Zap) com Prisma/BullMQ/HTTP
  mockados. Rodar contra infra real fica como próximo passo antes de produção.
- **Latência de 5s é orçada, não medida.** Os timeouts do handler garantem o
  teto por construção, mas ainda não há medição ponta a ponta com a Router
  API real — fica pra validação em staging.
- **Formato da Perplexity Router API assumido como compatível com
  `chat/completions`.** Base URL e modelo são env justamente por isso: se a
  rota real divergir, é configuração, não reescrita. Confirmar contra a conta
  real antes de produção.
- **Provisionamento de conta financeira é manual** (`prisma:seed`). Não há
  ainda vínculo automático entre número de WhatsApp e conta MonneyHub — o
  handler responde "conta não encontrada" quando o `wa_id` não bate.
