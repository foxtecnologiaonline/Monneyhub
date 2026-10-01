> **Contexto padrão FOX TecnologIA:** React Native/Expo, Next.js, PostgreSQL, BullMQ+Redis, S3/R2, Claude Sonnet como IA primária (Bedrock só como fallback), multi-tenant desde o MVP, LGPD desde o dia 1.
>
> **Depende de:** ZapMonney em produção no repo `foxtecnologiaonline/zapscript` (API Fastify + Postgres/Supabase + Evolution API). Não depende da Camada A (Gateway Meta) nem do schema `finance` deste repo — ver §2.

## 6. MonneyHub — app/web financeiro (MVP)

**Objetivo:** o lugar onde a pessoa *vê* e *organiza* o dinheiro dela, com o
WhatsApp como pista rápida de entrada. Dois produtos, uma conta, um dado.

| | Onde roda | O que faz melhor |
|---|---|---|
| **ZapMonney** | `zapscript` (API + worker, Evolution API) | **capturar**: ditar um gasto em 3 segundos, sem abrir app |
| **MonneyHub** | este repo (Next.js) | **enxergar e corrigir**: o mês inteiro de uma vez, histórico editável |

Não são duas versões do mesmo produto. São as duas metades de um só: ninguém
quer preencher formulário no corredor do mercado, e ninguém quer revisar três
meses de gasto por mensagem de texto.

### 1. Uma fonte da verdade

O dado financeiro vive **só** no Postgres do ZapScript (`ZmUser`,
`ZmTransaction`). O MonneyHub é cliente da API do ZapScript: sem Prisma no
caminho da interface, sem tabela espelho, sem fila de sincronização.

Isso não é economia de código, é a escolha entre duas classes de problema. Com
dois bancos escrevendo a mesma linha, "sincronizar" significa resolver conflito,
ordem e duplicata — a pessoa confirma um lançamento no app enquanto manda outro
no WhatsApp, e alguém decide quem ganhou. Com um banco, a simultaneidade é
consequência de não haver o que reconciliar.

### 2. Consequência para o que já existe neste repo

A Camada A (Gateway Meta), o handler `monneyhub-zap` (**removido**) e o schema
`finance` não participam deste produto. O assistente de WhatsApp é o do
`zapscript`, no ar sobre Evolution API.

A Camada C (memória) e o MEI-Oráculo seguem servindo `personai`, `sales-agent` e
`normas-ia`. Fica registrado, fora deste MVP: **o MEI-Oráculo lê
`finance.Transaction`, que sob esta decisão não recebe o dado real** — ou passa a
consumir a API do ZapScript, ou opera sobre outra base.

### 3. O que "integrado e sincronizado" significa, concretamente

Não há job de sincronização porque não há dois lados para sincronizar. O que
existe são travessias observáveis:

| A pessoa faz | O outro lado vê |
|---|---|
| dita "gastei 50 no mercado" no WhatsApp | o lançamento aparece no app como **pendente**, com selo de "aguardando confirmação" |
| confirma pelo app (botão) | o "sim" no WhatsApp responde que não há nada pendente — já foi |
| lança manualmente no app | "qual meu saldo" no WhatsApp já conta esse valor |
| corrige o valor de um gasto antigo no app | o resumo do mês no WhatsApp muda na mesma consulta |
| pede "apagar meus dados" em qualquer um dos dois | some dos dois, por cascade |

**A ponte dos pendentes é a prova mais visível da integração** e também o melhor
uso da interface: confirmar em lote três lançamentos ditados no caminho de casa
é desconfortável por conversa e trivial por tela.

**Tempo real no MVP: não.** O app refaz a busca ao ganhar foco da janela e
depois de cada alteração — nada de WebSocket. O motivo é que o canal de aviso já
existe e é melhor: quem precisa ser avisado de algo recebe no WhatsApp. Socket.IO
para salas `zm:*` é fase 2, se aparecer necessidade real.

### 4. Autenticação: código pelo próprio WhatsApp

Sem senha e sem e-mail, porque a identidade do ZapMonney nunca teve: `ZmUser` é o
telefone e a prova é a posse do WhatsApp.

```
telefone no app → API gera código de 6 dígitos (Redis, TTL 5min)
  → envia pelo MESMO número com quem a pessoa já conversa
  → código no app → sessão (JWT aud "zm", 7 dias)
```

Decisões já implementadas em `apps/api/src/routes/zapmonney.ts`:

- **Resposta idêntica exista conta ou não** — senão o endpoint vira um oráculo de
  "este telefone usa o ZapMonney", que é dado de terceiro.
- **Teto de 5 tentativas por código** — em 6 dígitos sem teto, um milhão de
  chutes cabe folgado nos 5 minutos de validade.
- Código em SHA-256, comparação em tempo constante, cooldown de 60s, teto diário
  por telefone **e** por IP.
- **Conta não nasce pela web.** Quem ainda não usa manda a primeira mensagem para
  o número, onde o consentimento é colhido. A web é porta de entrada de quem já
  entrou.
- Sessão com `audience` próprio, jamais o `zs_token` do painel B2B: `ZmUser` é
  qualquer pessoa com um telefone, `User` é cliente pagante.

### 5. Telas do MVP

Mobile-first: a maior parte do uso é no mesmo celular onde está o WhatsApp.

**5.1 Login** (`(hub)/login`) — um campo de telefone, um de código. Estados:
enviando, código enviado (com contagem para reenviar), código errado (com
tentativas restantes), bloqueado por tentativas.

**5.2 Mês** (`(hub)/`) — a tela inicial.
- KPI: saldo (figura principal), entradas, saídas
- Gastos por categoria (ver §6)
- Selo de pendentes, quando houver, levando para 5.4
- Seletor de mês
- Vazio: "você ainda não tem lançamentos neste mês" + como ditar o primeiro

**5.3 Lançamentos** (`(hub)/lancamentos`) — lista do mês, filtro por categoria e
tipo, editar e apagar na própria linha. Paginação por cursor.

**5.4 Pendentes** (`(hub)/pendentes`) — o que o ZapMonney extraiu e espera
confirmação. Confirmar ou descartar, individual ou em lote. Mostra o texto
original ditado ao lado do que foi extraído, para a conferência ser possível.

**5.5 Conta** (`(hub)/conta`) — nome, telefone, e exclusão total (LGPD) com
confirmação por frase, igual ao `APAGAR TUDO` da conversa.

**Fora das telas:** captura rápida como ação principal. O formulário de
lançamento manual existe, secundário — ditar continua sendo o caminho curto.

### 6. Visualização de dados

As escolhas abaixo seguem o método de visualização da casa, e **duas delas
corrigem o que parecia obvio**:

**Não há rosca nem pizza.** O trabalho do leitor na tela de categorias é
*comparar magnitude* ("em que eu gasto mais?"), e para isso a forma é **barra
horizontal ordenada**, não fatia de círculo — comparar ângulos é mais difícil que
comparar comprimentos, e nomes de categoria caem bem na horizontal. Com dez
categorias, um círculo fatiado também estouraria qualquer paleta legível.

**Barra com uma hue só, não dez cores.** O comprimento já codifica a magnitude;
cor não precisa repetir a informação. Dez cores categóricas seriam ilegíveis sob
daltonismo (acima de 7–8 séries nenhuma paleta se sustenta) e pintariam de
identidade algo que é só tamanho. Hue única: `#2a78d6` no claro, `#3987e5` no
escuro.

**Saldo positivo e negativo nunca por cor sozinha.** Verde e vermelho são a
escolha mais natural num app financeiro e reprovam na verificação de daltonismo
— `#0ca30c` ↔ `#d03b3b` dão ΔE 4.1 em deuteranopia, bem abaixo do mínimo de 8.
A cor fica, mas sempre acompanhada de **sinal (+/−) e rótulo**, nunca sozinha.

| Dado | Forma | Cor |
|---|---|---|
| saldo, entradas, saídas | KPI / figura principal | tokens de texto + sinal |
| gastos por categoria | barra horizontal ordenada, rótulo de valor direto | hue única |
| evolução entre meses (fase 2) | linha, série única, com crosshair | mesma hue |
| lista de categorias | tabela, sempre disponível | — |

Sem biblioteca de gráfico: duas formas em SVG inline, ~80 linhas, zero
dependência e controle total do tema claro/escuro. Recharts ainda tem atrito com
o React 19 deste repo. Se os gráficos crescerem, a decisão se revisita.

Modo escuro é **escolhido**, não inversão automática: valores próprios para a
superfície escura.

### 7. API (já implementada)

Em `apps/api/src/routes/zapmonney.ts`, prefixo `/zapmonney`, tudo escopado ao
`zmUserId` da sessão:

```
POST   /auth/request-code · POST /auth/verify · GET /me
GET    /transactions ?month=&type=&category=&status=&cursor=&limit=
POST   /transactions · PATCH /transactions/:id · DELETE /transactions/:id
POST   /transactions/:id/confirm
GET    /summary ?month=
DELETE /account
```

Alteração e exclusão usam `updateMany` com `zmUserId` no WHERE, não `update` por
id: a garantia de que ninguém mexe no lançamento de outra pessoa fica no SQL, não
numa checagem que alguém esquece de repetir na próxima rota.

CORS pela env `EXTRA_ORIGINS` que já existe — o domínio do Hub entra lá.

### 8. Fora do MVP

Export CSV, orçamento e metas, categorias customizadas, evolução entre meses,
PWA instalável, push próprio, Open Finance (ver §10), app de loja.

### 9. Critérios de aceite

- Um lançamento confirmado no Hub entra no "saldo" pedido no WhatsApp na mesma
  hora, e vice-versa, sem nenhum job de sincronização.
- Um pendente criado por voz no WhatsApp aparece no Hub com o texto original ao
  lado do valor extraído, e pode ser confirmado lá.
- Nenhuma rota responde dado de `zmUserId` diferente do da sessão, mesmo
  recebendo telefone no corpo.
- `src/app/(hub)/` não importa `@prisma/client` em nenhum arquivo.
- Nenhum estado financeiro é comunicado por cor sozinha.
- Funciona em largura de celular sem rolagem horizontal, nos dois temas.

### 10. Riscos e pendências

- **Dado de mercado.** O ZapMonney tem a lacuna aberta: `api.bcb.gov.br` está
  bloqueado no ambiente de desenvolvimento e os códigos de série não foram
  verificados. `src/lib/perplexity/` ficou neste repo, sem consumidor, e resolve
  exatamente essa lacuna — candidata a porte.
- **Open Finance não entra.** Pluggy (~R$2,5k/mês) e Belvo (~R$6k/mês) são piso
  fixo antes do primeiro usuário, num produto gratuito; e custariam o
  diferencial de não pedir credencial bancária e de funcionar para dinheiro vivo
  e PIX informal, que Open Finance não enxerga. Enriquecimento opcional no
  futuro, nunca dependência.
- **Domínio.** MVP no domínio da Vercel; apontar domínio próprio depois é
  `EXTRA_ORIGINS` + DNS, não código.
- **Sessão de 7 dias** em `localStorage` sem rotação de refresh: aceitável
  porque renovar custa uma ida ao WhatsApp, mas é o primeiro item a endurecer se
  o produto crescer.
