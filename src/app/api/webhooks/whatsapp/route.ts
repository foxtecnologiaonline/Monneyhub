import { NextRequest, NextResponse } from "next/server";
import { verifyWebhookChallenge, isValidWhatsAppSignature } from "@/lib/whatsapp/verify";
import { normalizeWhatsAppPayload } from "@/lib/whatsapp/normalize";
import { findTenantsByPhoneNumberIds } from "@/lib/tenant";
import { getWhatsappInboundQueue } from "@/lib/queue";
import { claimWhatsAppMessage } from "@/lib/whatsapp/dedupe";
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

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    // 400 em vez de 500: corpo inválido não é erro nosso e não deve virar retry infinito da Meta.
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }

  const messages = normalizeWhatsAppPayload(body);
  if (messages.length === 0) {
    return NextResponse.json({ received: true, enqueued: 0 });
  }

  // Claim atômico (Redis SET NX) antes de qualquer trabalho: cobre reentrega
  // da Meta E corrida entre réplicas do webhook, que um "consulta o tenant,
  // depois enfileira" não cobriria.
  const claimed = await Promise.all(
    messages.map(async (message) => ({
      message,
      claimed: await claimWhatsAppMessage(message.waMessageId),
    })),
  );

  const survivors = claimed.flatMap(({ message, claimed }) => {
    if (!claimed) {
      console.info(`[whatsapp] reentrega ignorada: ${message.waMessageId}`);
      return [];
    }
    return [message];
  });

  const tenantsByPhoneNumberId = await findTenantsByPhoneNumberIds(
    survivors.map((message) => message.phoneNumberId),
  );

  const jobs = survivors.flatMap((message) => {
    const tenant = tenantsByPhoneNumberId.get(message.phoneNumberId);
    if (!tenant) {
      console.warn(`Mensagem de phone_number_id desconhecido: ${message.phoneNumberId}`);
      return [];
    }

    const normalized: NormalizedMessage = {
      tenantId: tenant.id,
      phoneNumberId: message.phoneNumberId,
      userId: message.waId,
      messageId: message.waMessageId,
      text: message.text,
      timestamp: message.timestamp,
      raw: message.raw,
    };

    // jobId = wamid: segunda camada de dedup, agora na fila — mesmo se o
    // claim no Redis for perdido (ex.: flush acidental), a fila não duplica.
    return [{ name: "inbound-message", data: normalized, opts: { jobId: message.waMessageId } }];
  });

  if (jobs.length > 0) {
    await getWhatsappInboundQueue().addBulk(jobs);
  }

  // A Meta espera 200 rápido — processamento real acontece no worker.
  return NextResponse.json({ received: true, enqueued: jobs.length });
}
