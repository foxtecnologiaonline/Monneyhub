> **Contexto padrão FOX TecnologIA:** React Native/Expo, Next.js, PostgreSQL, BullMQ+Redis, S3/R2, Claude Sonnet como IA primária (Bedrock só como fallback), multi-tenant desde o MVP, LGPD desde o dia 1.
>
> **Depende de:** ZapMonney em produção no repo `foxtecnologiaonline/zapscript` (API Fastify + Postgres/Supabase + Evolution API). Não depende da Camada A (Gateway Meta) nem do schema `finance` deste repo — ver §2.

## 6. MonneyHub Hub Visual (interface do ZapMonney)

**Objetivo:** dar à pessoa uma interface gráfica para o mesmo controle financeiro que ela já faz conversando no WhatsApp, sem que exista qualquer passo de sincronização entre os dois.

**Produtos e papéis:**

| | Onde roda | Para quê serve |
|---|---|---|
| **ZapMonney** | `zapscript` (API + worker, Evolution API) | captura rápida por conversa: ditar gasto, confirmar, consultar |
| **MonneyHub** | este repo (Next.js) | ver o mês, corrigir histórico, resolver pendências, comparar |

### 1. Decisão estrutural: uma fonte da verdade

O dado financeiro vive **só** no Postgres do ZapScript (`ZmUser`, `ZmTransaction`). O MonneyHub é
**cliente puro** da API do ZapScript — não tem Prisma no caminho da interface, não tem tabela
espelho, não tem fila de sincronização.

Isso não é economia de código, é a diferença entre duas classes de problema. Com dois bancos
escrevendo a mesma linha, "sincronizar" significa resolver conflito, ordem e duplicata: a pessoa
confirma um lançamento no app enquanto manda outro no WhatsApp, e alguém tem que decidir quem
ganhou. Com um banco, isso não existe — o app e a conversa leem e escrevem a mesma linha, e a
simultaneidade é consequência, não feature.

### 2. Consequência para o que já existe neste repo

A Camada A (Gateway WhatsApp via Meta Business API), o handler `monneyhub-zap` e o schema
`finance` (`Account`, `Transaction`) **não participam deste produto**. O assistente de WhatsApp
que vai para produção é o do `zapscript`, que já está no ar e usa Evolution API.

Nada aqui é removido por este escopo — a Camada C (memória) e o MEI-Oráculo seguem servindo
`personai`, `sales-agent` e `normas-ia`. Mas fica registrado um ponto a decidir fora deste MVP:
**o MEI-Oráculo lê `finance.Transaction`, que sob esta decisão não recebe o dado real.** Ou ele
passa a consumir a API do ZapScript, ou opera sobre outra base. Não é problema do Hub Visual,
e não deve ser resolvido junto com ele.

### 3. Autenticação: código pelo próprio WhatsApp

Não há senha nem e-mail, porque a identidade do ZapMonney nunca teve: `ZmUser` é o telefone, e a
prova é a posse do WhatsApp. A interface reaproveita exatamente essa âncora.

```
pessoa digita o telefone no Hub
  → API do ZapScript gera código de 6 dígitos (Redis, TTL 5min)
  → envia pelo MESMO número com quem ela já conversa (Evolution)
  → pessoa digita o código
  → sessão (JWT audience "zm")
```

Elegante porque não inventa canal: já somos donos do WhatsApp dela. E o código chega no lugar
onde ela está acostumada a receber o resto.

**Sessão separada da do ZapScript B2B, obrigatoriamente.** O painel atual guarda
`zs_token`/`zs_refresh` para a identidade `User` (conta paga). `ZmUser` é outro espaço de
identidade — chave de storage própria e JWT com `audience` próprio. Misturar os dois é criar
confusão de autenticação entre um produto aberto a qualquer pessoa e o painel de clientes.

### 4. Trabalho no `zapscript` (back-end) — pré-requisito

Nada disso existe ainda. Em `apps/api/src/routes/zapmonney.ts`, tudo escopado ao `zmUserId` da
sessão:

```
POST   /zapmonney/auth/request-code        { phone } → envia OTP via Evolution
POST   /zapmonney/auth/verify              { phone, code } → { token }
GET    /zapmonney/me
GET    /zapmonney/transactions             ?month=&category=&type=&cursor=
PATCH  /zapmonney/transactions/:id         valor, categoria, descrição, data
DELETE /zapmonney/transactions/:id         → status 'deleted'
POST   /zapmonney/transactions/:id/confirm → status 'confirmed'
POST   /zapmonney/transactions             criação manual (secundária, ver §6)
GET    /zapmonney/summary                  ?month= → saldo, por categoria, projeção
DELETE /zapmonney/account                  LGPD, mesmo efeito do "APAGAR TUDO" no chat
```

Reaproveita o que já está lá: `sendText` (Evolution), `redis`, `prisma`, e as mesmas regras de
agregação de `zapmonney-executor.ts` — mês fechado em America/São_Paulo, status `confirmed`
contando no saldo, `pending` fora dele.

**Regra de ouro:** a query filtra por `zmUserId` da sessão, nunca por telefone vindo do request.

### 5. Trabalho neste repo (front-end)

```
src/app/(hub)/
  layout.tsx            shell do Hub (marca MonneyHub, navegação)
  login/page.tsx        telefone → código → sessão
  page.tsx              mês atual: saldo, entradas, saídas, gráfico por categoria
  lancamentos/page.tsx  lista filtrável, editar e apagar inline
  pendentes/page.tsx    confirmar em lote o que ficou em aberto
src/lib/zapscript-api.ts   cliente HTTP (token, refresh, erro)
```

**Guardrail do diretório:** nenhum import de `@prisma/client` dentro de `src/app/(hub)/`. Se
aparecer, a decisão da §1 foi violada e o produto ganhou um segundo banco sem ninguém decidir.

### 6. Escopo funcional v1

**Dentro:**
- Login por código no WhatsApp
- Mês atual: saldo, entradas, saídas, gráfico de categorias
- Lançamentos: lista filtrável por mês, categoria e tipo; editar e apagar
- Pendentes: confirmar ou descartar, em lote
- Exclusão de conta (LGPD)

**Fora (fase 2):** export CSV, orçamento/metas, categorias customizadas, histórico comparativo
entre meses, PWA instalável, push.

**A interface não imita o chat.** Captura rápida continua sendo do WhatsApp — o valor é ditar
"gastei 50 no mercado" em três segundos, e nenhum formulário ganha disso. O formulário de
lançamento manual existe como ação secundária, para quem está no app e não quer trocar de tela.
O que a interface faz melhor é o inverso: ver o mês inteiro de uma vez, e corrigir coisa antiga
— que por conversa é péssimo e por tabela é trivial.

### 7. Web, não app de loja

PWA com Next.js, não Expo, no MVP: um código só, sem review de loja, sem pipeline nativo. O
argumento decisivo é que **o canal de notificação já existe e é melhor** — a pessoa recebe no
WhatsApp, que no Brasil tem alcance que push de app não tem. Expo entra se aparecer necessidade
que a web não cubra.

### 8. Critérios de aceite

- Um lançamento confirmado no Hub aparece no "saldo" pedido no WhatsApp na mesma hora, e
  vice-versa, sem nenhum job de sincronização entre os dois.
- Nenhuma rota responde dado de um `zmUserId` diferente do da sessão, mesmo recebendo telefone
  no corpo.
- OTP: 6 dígitos, TTL de 5 minutos, no máximo 5 tentativas por código, com limite por telefone
  e por IP.
- `src/app/(hub)/` não importa `@prisma/client` em nenhum arquivo.
- O Hub funciona em largura de celular sem rolagem horizontal.

### 9. Pendências de decisão

- **Domínio do Hub.** Define o CORS da API do ZapScript (hoje serve `zapscript.me`) e o deploy.
- **Biblioteca de gráfico.** Nenhuma instalada neste repo ainda.
- **Destino do `monneyhub-zap`.** Fica como experimento parado, ou é desativado explicitamente
  para ninguém ligar o gateway Meta por engano e criar um segundo assistente no ar?
