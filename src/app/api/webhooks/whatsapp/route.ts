import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookChallenge, isValidWhatsAppSignature } from "@/lib/whatsapp/verify";
import { normalizeWhatsAppPayload } from "@/lib/whatsapp/normalize";
import { identifyTenantByPhoneNumberId } from "@/lib/tenant";
import { getWhatsappInboundQueue } from "@/lib/queue";
import type { NormalizedMessage } from "@/lib/handlers/types";

/**
 * Webhook único do Gateway WhatsApp (Camada A). Responsabilidade só do
 * gateway: verificar handshake, autenticar assinatura, identificar tenant,
 * normalizar e enfileirar. Classificação e despacho pro produto acontecem
 * no worker (src/workers/whatsapp-inbound.worker.ts), fora do ciclo de
 * request — a Meta exige resposta rápida (2xx em poucos segundos).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const challenge = verifyWebhookChallenge({
    mode: searchParams.get("hub.mode"),
    token: searchParams.get("hub.verify_token"),
    challenge: searchParams.get("hub.challenge"),
  });

  if (challenge === null) {
    return new NextResponse("Forbidden", { status: 403 });
  }
  return new NextResponse(challenge, { status: 200 });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const signatureHeader = request.headers.get("x-hub-signature-256");
  if (!isValidWhatsAppSignature(rawBody, signatureHeader)) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  const body = JSON.parse(rawBody);
  const messages = normalizeWhatsAppPayload(body);

  const queue = getWhatsappInboundQueue();

  await Promise.all(
    messages.map(async (message) => {
      const tenant = await identifyTenantByPhoneNumberId(message.phoneNumberId);
      if (!tenant) {
        console.warn(`Mensagem de phone_number_id desconhecido: ${message.phoneNumberId}`);
        return;
      }

      const normalized: NormalizedMessage = {
        tenantId: tenant.id,
        userId: message.waId,
        text: message.text,
        timestamp: message.timestamp,
        raw: message.raw,
      };

      await queue.add("inbound-message", normalized);
    }),
  );

  // A Meta espera 200 rápido — processamento real acontece no worker.
  return NextResponse.json({ received: true });
}
