import type { ProductHandler } from "@/lib/handlers/types";

/**
 * Placeholder — implementação real entra na Fase 1 (MonneyHub Zap).
 * Conforme a interface comum: recebe mensagem normalizada, devolve resposta.
 */
export const monneyhubZapHandler: ProductHandler = async (message) => {
  return {
    replyText:
      "MonneyHub Zap ainda em construção — em breve você consulta saldo e previsão por aqui.",
    meta: { product: "monneyhub-zap", stub: true, receivedFrom: message.userId },
  };
};
