import { Queue } from "bullmq";
import { getRedisConnection } from "@/lib/redis";
import type { NormalizedMessage } from "@/lib/handlers/types";

export const WHATSAPP_INBOUND_QUEUE = "whatsapp-inbound";
export const FORECAST_ALERTS_QUEUE = "forecast-alerts";

export interface NegativeBalanceAlert {
  tenantId: string;
  userId: string;
  runId: string;
  /** Dia previsto em que o saldo (P50) fica negativo. */
  crossingDate: string;
  projectedBalance: number;
  /** Dias de antecedência entre hoje e o cruzamento. */
  leadDays: number;
  /** Critério de aceite: alerta com pelo menos 15 dias de antecedência. */
  meetsLeadTimeTarget: boolean;
}

let inboundQueue: Queue<NormalizedMessage> | undefined;
let alertsQueue: Queue<NegativeBalanceAlert> | undefined;

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

/** Alertas proativos de saldo negativo previstos pelo MEI-Oráculo. */
export function getForecastAlertsQueue(): Queue<NegativeBalanceAlert> {
  if (!alertsQueue) {
    alertsQueue = new Queue<NegativeBalanceAlert>(FORECAST_ALERTS_QUEUE, {
      connection: getRedisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    });
  }
  return alertsQueue;
}
