import type { ProductHandler } from "@/lib/handlers/types";

/**
 * Placeholder — implementação real entra na Fase 5 (PersonAI), já
 * consumindo o Serviço de Memória/Contexto (Camada C). Conforme a
 * interface comum: recebe mensagem normalizada, devolve resposta.
 */
export const personaiHandler: ProductHandler = async (message) => {
  return {
    replyText: "PersonAI ainda em construção — em breve eu lembro do nosso contexto por aqui.",
    meta: { product: "personai", stub: true, receivedFrom: message.userId },
  };
};
