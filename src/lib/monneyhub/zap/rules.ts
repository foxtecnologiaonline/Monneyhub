/**
 * Regras puras do MonneyHub Zap: que tipo de pergunta é, e quando a resposta
 * precisa carregar disclaimer. Sem I/O — é o que precisa ser garantido por
 * teste, porque é critério de aceite do produto.
 */

export const INVESTMENT_DISCLAIMER = "Isto não é recomendação de investimento.";

export type FinancialIntent =
  /** Saldo atual — dado interno. */
  | "BALANCE"
  /** Extrato / últimos lançamentos — dado interno. */
  | "STATEMENT"
  /** Previsão de fluxo de caixa — MEI-Oráculo. */
  | "FORECAST"
  /** Pergunta aberta sobre mercado/finanças — precisa de dado externo atual. */
  | "MARKET";

/**
 * Classificação por palavra-chave de propósito: a latência alvo é < 5s
 * incluindo a chamada à Router API, então o roteamento interno não gasta
 * mais um ida-e-volta de LLM.
 */
export function classifyFinancialIntent(text: string): FinancialIntent {
  const lower = text.toLowerCase();

  if (/(previs|proje|fluxo de caixa|próximos \d+ dias|vou ficar no vermelho)/.test(lower)) {
    return "FORECAST";
  }
  if (/(extrato|lançamento|últimas? (transaç|movimenta)|movimenta)/.test(lower)) {
    return "STATEMENT";
  }
  if (/(saldo|quanto (eu )?tenho|quanto sobrou|caixa hoje)/.test(lower)) {
    return "BALANCE";
  }
  return "MARKET";
}

const INVESTMENT_TERMS =
  /(investi|aplica|render|rentabilidade|cdi|selic|tesouro|cdb|lci|lca|fundo|ação|ações|bolsa|cripto|bitcoin|dólar|poupança)/;

/** A resposta toca em investimento? Vale pra pergunta e pra resposta. */
export function touchesInvestment(...texts: string[]): boolean {
  return texts.some((text) => INVESTMENT_TERMS.test(text.toLowerCase()));
}

/**
 * Critério de aceite: 100% das respostas que mencionam investimento/aplicação
 * carregam o disclaimer. Idempotente — não duplica se já estiver lá.
 */
export function applyInvestmentDisclaimer(reply: string, question = ""): string {
  if (!touchesInvestment(reply, question)) return reply;
  if (reply.includes(INVESTMENT_DISCLAIMER)) return reply;
  return `${reply.trimEnd()}\n\n${INVESTMENT_DISCLAIMER}`;
}
