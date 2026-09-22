/** Interface comum que o Gateway usa pra despachar pra qualquer produto. */

export interface NormalizedMessage {
  tenantId: string;
  /** wa_id (número) do remetente na Meta Business API. */
  userId: string;
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
