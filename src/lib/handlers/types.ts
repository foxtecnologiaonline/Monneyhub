/** Interface comum que o Gateway usa pra despachar pra qualquer produto. */

export interface NormalizedMessage {
  tenantId: string;
  /** phone_number_id do tenant na Meta — usado pra responder sem reconsultar o banco. */
  phoneNumberId: string;
  /** wa_id (número) do remetente na Meta Business API. */
  userId: string;
  /** wamid da mensagem — identidade estável, usada pra deduplicar reentrega. */
  messageId: string;
  text: string;
  /** ISO 8601 */
  timestamp: string;
  /** Payload original da Meta, pra handler que precise de mais contexto. */
  raw: unknown;
}

export interface HandlerResponse {
  replyText: string;
  meta?: Record<string, unknown>;
}

export type ProductHandler = (message: NormalizedMessage) => Promise<HandlerResponse>;

export type ProductName = "sales-agent" | "monneyhub-zap" | "normas-ia" | "personai";
