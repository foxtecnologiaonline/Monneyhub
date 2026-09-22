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
  `normas-ia`, `personai`) são **placeholders** — cada um implementa a
  interface comum `ProductHandler` (`src/lib/handlers/types.ts`) e será
  substituído na fase do roadmap correspondente.

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
`ANTHROPIC_API_KEY`, `INTERNAL_API_KEY`.

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
  roteamento, serviço de memória) com Prisma/BullMQ mockados. Rodar contra
  infra real fica como próximo passo antes de produção.
