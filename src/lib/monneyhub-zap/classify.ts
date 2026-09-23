export type ZapIntent = "BALANCE" | "STATEMENT" | "FORECAST" | "MARKET";

/**
 * Sub-classificação dentro do MonneyHub Zap: o Gateway já decidiu que a
 * mensagem é deste produto, aqui só separamos dado interno (Postgres),
 * previsão (MEI-Oráculo) e pergunta de mercado (Router API).
 *
 * Determinístico de propósito: é o passo mais barato do fluxo e não pode
 * comer o orçamento de 5s que a chamada à Router API vai precisar.
 *
 * Ordem importa. FORECAST vem primeiro porque "previsão de lançamentos" e
 * "como fica meu saldo mês que vem" carregam termo de extrato/saldo sem
 * serem consulta de extrato/saldo. STATEMENT antes de BALANCE porque
 * "extrato do saldo" é extrato.
 */
export function classifyZapIntent(text: string): ZapIntent {
  const lower = text.toLowerCase();

  if (
    /(previs|prever|proje[çc]|fluxo de caixa|pr[óo]ximos? (dias|meses|30|60|90)|vou ficar no vermelho|no vermelho|vai dar pra pagar|fecha[r]? o m[êe]s)/.test(
      lower,
    )
  ) {
    return "FORECAST";
  }

  if (/(extrato|lançament|transaç|movimentaç|últimas? (compras|vendas|movimentaç))/.test(lower)) {
    return "STATEMENT";
  }

  if (/(saldo|quanto (eu )?tenho|quanto sobrou|disponível em conta)/.test(lower)) {
    return "BALANCE";
  }

  return "MARKET";
}
