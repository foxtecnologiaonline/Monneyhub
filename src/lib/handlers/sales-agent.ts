import type { ProductHandler } from "@/lib/handlers/types";

/**
 * Placeholder — implementação real entra na Fase 2 (Sales Agent).
 * Conforme a interface comum: recebe mensagem normalizada, devolve resposta.
 */
export const salesAgentHandler: ProductHandler = async (message) => {
  return {
    replyText:
      "Obrigado pelo contato! Nosso time comercial vai te responder em breve.",
    meta: { product: "sales-agent", stub: true, receivedFrom: message.userId },
  };
};
