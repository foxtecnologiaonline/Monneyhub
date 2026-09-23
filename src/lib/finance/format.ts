/**
 * Intl e não concatenação manual: sem separador de milhar, "R$ 1200,50" é
 * o tipo de detalhe que faz o MEI desconfiar do número. O replace troca o
 * espaço não-quebrável que o Intl insere por espaço comum — WhatsApp lida
 * melhor, e é o que os testes leem.
 */
export function formatMoney(amount: string, currency: string): string {
  const value = Number(amount);
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency })
      .format(value)
      .replace(/ /g, " ");
  } catch {
    return `${currency} ${value.toFixed(2).replace(".", ",")}`;
  }
}
