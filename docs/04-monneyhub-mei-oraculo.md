> **Contexto padrão FOX TecnologIA:** React Native/Expo, Next.js, PostgreSQL, BullMQ+Redis, S3/R2, Claude Sonnet como IA primária (Bedrock só como fallback), multi-tenant desde o MVP, LGPD desde o dia 1.

## 4. MonneyHub MEI - Oráculo

**Objetivo:** prever fluxo de caixa do MEI em 30/60/90 dias a partir do histórico transacional que o MonneyHub já guarda.

**Provedores:** Amazon Forecast (modelo de série temporal, sem precisar treinar do zero).

**Escopo funcional v1:**
- Pipeline de export do histórico transacional (Postgres → S3, formato aceito pelo Forecast).
- Treino inicial com pelo menos 6 meses de histórico por usuário (usuário com menos histórico cai em modo "aguardando dado suficiente").
- Previsão exibida como faixa (otimista/realista/pessimista), não número único — evita falsa precisão.
- Alerta proativo quando a previsão indica saldo negativo dentro da janela de 30 dias.

**Fora de escopo v1:** recomendação automática de ação financeira (ex.: "corte gasto X") — isso é responsabilidade jurídica/consultiva demais pro v1, fica pra depois.

**Critérios de aceite:**
- Erro percentual médio (MAPE) documentado e exposto internamente — não prometer precisão sem medir.
- Alerta de saldo negativo disparado com pelo menos 15 dias de antecedência em teste retroativo.

**Prompt inicial pro Claude Code:** "Implemente pipeline de export de transações do MonneyHub pro formato do Amazon Forecast, job de treino/atualização semanal, e endpoint que devolve previsão de saldo em faixa (P10/P50/P90) pros próximos 30/60/90 dias. Alerta via fila quando P50 cruza zero dentro de 30 dias."
