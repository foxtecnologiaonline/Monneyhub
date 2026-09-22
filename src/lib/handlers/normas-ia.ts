import type { ProductHandler } from "@/lib/handlers/types";

/**
 * Placeholder — implementação real entra na Fase 2 (Normas.IA).
 * Conforme a interface comum: recebe mensagem normalizada, devolve resposta.
 */
export const normasIaHandler: ProductHandler = async (message) => {
  return {
    replyText: "Normas.IA ainda em construção — em breve você tira dúvidas regulatórias por aqui.",
    meta: { product: "normas-ia", stub: true, receivedFrom: message.userId },
  };
};
