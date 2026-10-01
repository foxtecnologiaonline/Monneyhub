# ⚠️ SUPERADO — não implementar

O código deste escopo foi **removido** deste repo. O assistente financeiro de
WhatsApp é o **ZapMonney**, no repo `foxtecnologiaonline/zapscript`, já em
produção sobre Evolution API, com o dado em `ZmUser`/`ZmTransaction`.

Dois assistentes financeiros no ar, sobre bancos diferentes, respondendo a mesma
pessoa, não é redundância: é duas verdades sobre quanto ela gastou.

O que sobrevive deste escopo, e onde:

- a **interface gráfica** virou o MonneyHub Hub Visual — [`06-monneyhub-hub-visual.md`](./06-monneyhub-hub-visual.md);
- as decisões de **guarda de conteúdo** e **disclaimer de investimento** foram
  portadas para o ZapMonney, no repo `zapscript`;
- `src/lib/safety/` e `src/lib/perplexity/` ficaram no repo, sem consumidor —
  a segunda resolve a lacuna de dado de mercado que o ZapMonney tem aberta.

Este arquivo fica como registro da decisão, não como plano. O conteúdo original
segue abaixo.

---

> **Contexto padrão FOX TecnologIA:** React Native/Expo, Next.js, PostgreSQL, BullMQ+Redis, S3/R2, Claude Sonnet como IA primária (Bedrock só como fallback), multi-tenant desde o MVP, LGPD desde o dia 1.
>
> **Depende de:** Camada A — Gateway WhatsApp/Roteador de Intenção — ver `00-visao-geral-e-camadas-compartilhadas.md`.

## 5. MonneyHub Zap (assistente financeiro no Zap) — SUPERADO

**Objetivo:** levar o MonneyHub pro WhatsApp como assistente conversacional que responde com dado de mercado atualizado, não só saldo interno.

**Provedores:** Perplexity Router API (contexto de mercado em tempo real — CDI, taxa, notícia) · Azure AI Content Safety (guarda de conteúdo antes de qualquer resposta sair) · Gateway WhatsApp compartilhado (canal — ver Camadas compartilhadas).

**Escopo funcional v1:**
- Handler consome mensagem já normalizada do Gateway WhatsApp compartilhado, classifica pergunta financeira.
- Consulta de saldo/extrato por mensagem de texto (dado interno) ou pergunta livre sobre finanças pessoais/MEI respondida via Router API com dado de mercado atual.
- Toda resposta financeira passa por Content Safety antes de enviar (evita recomendação que soe como aconselhamento financeiro regulado).
- Disclaimer fixo em resposta que toque em investimento: "não é recomendação de investimento".

**Fora de escopo v1:** transação financeira real pelo WhatsApp (PIX, pagamento) — só consulta e informação no v1.

**Critérios de aceite:**
- 100% das respostas que mencionam investimento/aplicação carregam o disclaimer.
- Latência de resposta < 5s incluindo chamada à Router API.

**Prompt inicial pro Claude Code:** "Implemente o handler do MonneyHub Zap consumindo mensagem normalizada do Gateway WhatsApp compartilhado: classifica pergunta financeira, consulta saldo interno (Postgres) ou dispara Perplexity Router API pra pergunta de mercado, passa resposta por Azure AI Content Safety, injeta disclaimer quando aplicável."
