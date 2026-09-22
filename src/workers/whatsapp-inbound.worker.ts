import { Worker, type Job } from "bullmq";
import { getRedisConnection } from "@/lib/redis";
import { WHATSAPP_INBOUND_QUEUE } from "@/lib/queue";
import { routeMessage } from "@/lib/intent/router";
import { sendWhatsAppTextMessage } from "@/lib/whatsapp/send";
import { prisma } from "@/lib/db";
import type { NormalizedMessage } from "@/lib/handlers/types";

/**
 * Consome a fila de entrada do Gateway WhatsApp: classifica intenção,
 * despacha pro handler do produto certo e envia a resposta de volta.
 * Rodar com `npm run worker:whatsapp`.
 */
async function processJob(job: Job<NormalizedMessage>): Promise<void> {
  const message = job.data;
  const { product, response } = await routeMessage(message);

  const tenant = await prisma.tenant.findUnique({ where: { id: message.tenantId } });
  if (!tenant) {
    throw new Error(`Tenant ${message.tenantId} não encontrado ao tentar responder.`);
  }

  await sendWhatsAppTextMessage({
    phoneNumberId: tenant.whatsappPhoneNumberId,
    to: message.userId,
    text: response.replyText,
  });

  console.info(`[whatsapp-inbound] tenant=${message.tenantId} produto=${product} respondido`);
}

const worker = new Worker<NormalizedMessage>(WHATSAPP_INBOUND_QUEUE, processJob, {
  connection: getRedisConnection(),
  concurrency: 10,
});

worker.on("failed", (job, err) => {
  console.error(`[whatsapp-inbound] job ${job?.id} falhou:`, err);
});

worker.on("ready", () => {
  console.info("[whatsapp-inbound] worker pronto");
});
