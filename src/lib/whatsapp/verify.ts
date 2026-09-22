import { createHmac, timingSafeEqual } from "node:crypto";

/** Handshake de verificação do webhook (GET), conforme doc da Meta. */
export function verifyWebhookChallenge(params: {
  mode: string | null;
  token: string | null;
  challenge: string | null;
}): string | null {
  const expectedToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (!expectedToken) {
    throw new Error("META_WEBHOOK_VERIFY_TOKEN não configurada.");
  }
  if (params.mode === "subscribe" && params.token === expectedToken && params.challenge) {
    return params.challenge;
  }
  return null;
}

/**
 * Valida a assinatura X-Hub-Signature-256 do corpo bruto da requisição
 * contra META_APP_SECRET. Precisa do corpo *bruto* (antes de JSON.parse) —
 * a Meta assina os bytes exatos enviados.
 */
export function isValidWhatsAppSignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    throw new Error("META_APP_SECRET não configurada.");
  }
  if (!signatureHeader?.startsWith("sha256=")) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const received = signatureHeader.slice("sha256=".length);

  const expectedBuf = Buffer.from(expected, "hex");
  const receivedBuf = Buffer.from(received, "hex");
  if (expectedBuf.length !== receivedBuf.length) return false;

  return timingSafeEqual(expectedBuf, receivedBuf);
}
