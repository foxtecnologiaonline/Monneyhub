export const INVESTMENT_DISCLAIMER = "Não é recomendação de investimento.";

/**
 * Padrão deliberadamente largo (superconjunto de "investimento/aplicação"):
 * o critério de aceite é 100% das respostas que tocam em investimento
 * levarem o disclaimer, então falso positivo custa uma linha a mais e falso
 * negativo custa exposição regulatória. A troca é óbvia.
 */
const INVESTMENT_PATTERN =
  /(investi|aplicaç|aplicar|renda fixa|renda variável|tesouro direto|\bcdb\b|\blci\b|\blca\b|\bcdi\b|selic|poupança|ações|\bfundo|bolsa|\bb3\b|cripto|bitcoin|dólar|juros|rentabilidad|dividendo|carteira)/i;

export function mentionsInvestment(text: string): boolean {
  return INVESTMENT_PATTERN.test(text);
}

/**
 * Carimba o disclaimer quando a resposta — ou a pergunta que a originou —
 * toca em investimento. Olha também a pergunta porque uma resposta do tipo
 * "não posso te orientar sobre isso" não repete o termo e ainda assim está
 * num contexto que exige o aviso.
 */
export function withInvestmentDisclaimer(replyText: string, questionText: string): string {
  if (!mentionsInvestment(replyText) && !mentionsInvestment(questionText)) {
    return replyText;
  }
  if (replyText.includes(INVESTMENT_DISCLAIMER)) {
    return replyText;
  }
  return `${replyText}\n\n⚠️ ${INVESTMENT_DISCLAIMER}`;
}
