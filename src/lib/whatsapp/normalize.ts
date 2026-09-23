/** Formato mínimo do payload de webhook da Meta Business API (mensagens de texto). */
interface MetaWebhookPayload {
  object?: string;
  entry?: Array<{
    id: string;
    changes: Array<{
      field: string;
      value: {
        metadata?: { phone_number_id?: string };
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          type: string;
          text?: { body: string };
        }>;
      };
    }>;
  }>;
}

export interface InboundWhatsAppMessage {
  phoneNumberId: string;
  /** wa_id do remetente */
  waId: string;
  /** wamid — identidade estável da mensagem na Meta, usada pra deduplicar reentrega. */
  waMessageId: string;
  text: string;
  timestamp: string;
  raw: unknown;
}

/** Timestamp da Meta vem em segundos como string; payload malformado não derruba o lote. */
function toIsoTimestamp(metaTimestamp: string): string {
  const seconds = Number(metaTimestamp);
  if (!Number.isFinite(seconds)) return new Date().toISOString();
  const date = new Date(seconds * 1000);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

/**
 * Extrai as mensagens de texto de um payload de webhook da Meta.
 * Um único POST pode trazer várias entries/changes/messages — v1 trata só
 * `type: "text"`; outros tipos (imagem, áudio, botão...) são ignorados por
 * ora e não derrubam o processamento do restante do lote.
 */
export function normalizeWhatsAppPayload(body: unknown): InboundWhatsAppMessage[] {
  const payload = body as MetaWebhookPayload;
  const out: InboundWhatsAppMessage[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      const phoneNumberId = change.value.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      for (const message of change.value.messages ?? []) {
        if (message.type !== "text" || !message.text?.body || !message.id) continue;
        out.push({
          phoneNumberId,
          waId: message.from,
          waMessageId: message.id,
          text: message.text.body,
          timestamp: toIsoTimestamp(message.timestamp),
          raw: message,
        });
      }
    }
  }

  return out;
}
