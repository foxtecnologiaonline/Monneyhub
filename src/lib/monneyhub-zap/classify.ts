export type ZapIntent = "BALANCE" | "STATEMENT" | "MARKET";

/**
 * Sub-classificação dentro do MonneyHub Zap: o Gateway já decidiu que a
 * mensagem é deste produto, aqui só separamos dado interno (Postgres) de
 * pergunta de mercado (Router API).
 *
 * Determinístico de propósito: é o passo mais barato do fluxo e não pode
 * comer o orçamento de 5s que a chamada à Router API vai precisar.
 * STATEMENT antes de BALANCE porque "extrato do saldo" é extrato.
 */
export function classifyZapIntent(text: string): ZapIntent {
  const lower = text.toLowerCase();

  if (/(extrato|lançament|transaç|movimentaç|últimas? (compras|vendas|movimentaç))/.test(lower)) {
    return "STATEMENT";
  }

  if (/(saldo|quanto (eu )?tenho|quanto sobrou|disponível em conta)/.test(lower)) {
    return "BALANCE";
  }

  return "MARKET";
}
