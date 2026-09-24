import { Queue } from "bullmq";
import { getRedisConnection } from "@/lib/redis";
import type { NormalizedMessage } from "@/lib/handlers/types";

export const WHATSAPP_INBOUND_QUEUE = "whatsapp-inbound";

let inboundQueue: Queue<NormalizedMessage> | undefined;

/** Fila de entrada única: o webhook enfileira, o worker classifica e despacha. */
export function getWhatsappInboundQueue(): Queue<NormalizedMessage> {
  if (!inboundQueue) {
    inboundQueue = new Queue<NormalizedMessage>(WHATSAPP_INBOUND_QUEUE, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });
  }
  return inboundQueue;
}

// A fila de alerta de saldo negativo (produtor: forecast-weekly.worker.ts,
// consumidor: forecast-alert.worker.ts) vive em @/lib/mei-oraculo/queue —
// não duplicar aqui. Esta fila já existiu neste arquivo com nome e formato
// de payload diferentes (forecast-alerts/NegativeBalanceAlert), órfã de uma
// sessão concorrente que não chegou a ligar produtor e consumidor; removida
// nesta revisão pra não deixar duas filas de alerta com o mesmo propósito.
