import { Queue } from "bullmq";
import { getRedisConnection } from "@/lib/redis";
import type { NormalizedMessage } from "@/lib/handlers/types";

export const WHATSAPP_INBOUND_QUEUE = "whatsapp-inbound";

let queue: Queue<NormalizedMessage> | undefined;

/** Fila de entrada única: o webhook enfileira, o worker classifica e despacha. */
export function getWhatsappInboundQueue(): Queue<NormalizedMessage> {
  if (!queue) {
    queue = new Queue<NormalizedMessage>(WHATSAPP_INBOUND_QUEUE, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });
  }
  return queue;
}
