import { Queue } from "bullmq";
import { getRedisConnection } from "@/lib/redis";

export const FORECAST_ALERT_QUEUE = "forecast-alert";

export interface ForecastAlertJob {
  tenantId: string;
  userId: string;
  crossesAtDay: number;
  leadDays: number;
  projectedBalance: number;
}

let queue: Queue<ForecastAlertJob> | undefined;

/** Alerta sai por fila: quem entrega (WhatsApp, push) é decisão do consumidor. */
export function getForecastAlertQueue(): Queue<ForecastAlertJob> {
  if (!queue) {
    queue = new Queue<ForecastAlertJob>(FORECAST_ALERT_QUEUE, {
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
