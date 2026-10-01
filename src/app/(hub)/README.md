# MonneyHub Hub Visual

Interface gráfica do ZapMonney. Escopo em [`docs/06-monneyhub-hub-visual.md`](../../../docs/06-monneyhub-hub-visual.md).

## O contrato deste diretório

Tudo aqui é **cliente puro** da API do ZapScript (`apps/api`, repo
`foxtecnologiaonline/zapscript`). O dado financeiro vive no Postgres de lá
(`ZmUser`, `ZmTransaction`) e em nenhum outro lugar.

**Nenhum arquivo sob `(hub)/` importa `@prisma/client`.** O Prisma deste repo serve a
Camada C (memória) e o MEI-Oráculo, não este produto. Se um import aparecer aqui, o
produto ganhou um segundo banco escrevendo a mesma linha — e aí "sincronizar" deixa de
ser consequência de ter uma fonte só e passa a ser conflito, ordem e duplicata para
alguém resolver.

A sessão também é separada: JWT com `audience` `zm`, chave de storage própria, nunca o
`zs_token` do painel B2B. São dois espaços de identidade diferentes — `ZmUser` é
qualquer pessoa com um telefone, `User` é cliente pagante do ZapScript.

## Estrutura prevista

```
layout.tsx            shell (marca, navegação)
login/page.tsx        telefone → código no WhatsApp → sessão
page.tsx              mês atual: saldo, entradas, saídas, categorias
lancamentos/page.tsx  lista filtrável, editar e apagar
pendentes/page.tsx    confirmar em lote
```

A captura rápida continua no WhatsApp: ditar "gastei 50 no mercado" em três segundos é
o valor do produto, e formulário nenhum ganha disso. Esta interface existe para o
inverso — ver o mês inteiro de uma vez e corrigir coisa antiga.
