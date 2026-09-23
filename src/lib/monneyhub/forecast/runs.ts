import { QueryForecastCommand } from "@aws-sdk/client-forecastquery";
import { prisma } from "@/lib/db";
import { getForecastQueryClient } from "@/lib/monneyhub/forecast/aws";
import { buildItemId } from "@/lib/monneyhub/forecast/export";
import {
  getCurrentBalance,
  getHistoryRange,
  listForecastableUsers,
} from "@/lib/finance/queries";
import {
  hasEnoughHistory,
  monthsOfHistory,
  toBalanceSeries,
  firstNegativeP50,
  MIN_ALERT_LEAD_DAYS,
  type DailyFlowQuantiles,
} from "@/lib/monneyhub/forecast/bands";
import { getForecastAlertsQueue, type NegativeBalanceAlert } from "@/lib/queue";
import type { ForecastPipeline } from "@prisma/client";

/** Quantis pedidos ao Forecast, na chave que ele devolve nas Predictions. */
const QUANTILE_KEYS = { p10: "0.1", p50: "0.5", p90: "0.9" } as const;

interface ForecastPredictionEntry {
  Timestamp?: string;
  Value?: number;
}

/** Junta as três séries de quantis do Forecast numa série diária única. */
export function mergeQuantileSeries(predictions: {
  p10?: ForecastPredictionEntry[];
  p50?: ForecastPredictionEntry[];
  p90?: ForecastPredictionEntry[];
}): DailyFlowQuantiles[] {
  const byDate = new Map<string, DailyFlowQuantiles>();

  const put = (entries: ForecastPredictionEntry[] | undefined, key: "p10" | "p50" | "p90") => {
    for (const entry of entries ?? []) {
      if (!entry.Timestamp) continue;
      const date = entry.Timestamp.slice(0, 10);
      const current = byDate.get(date) ?? { date, p10: 0, p50: 0, p90: 0 };
      current[key] = entry.Value ?? 0;
      byDate.set(date, current);
    }
  };

  put(predictions.p10, "p10");
  put(predictions.p50, "p50");
  put(predictions.p90, "p90");

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Estágio final do pipeline: consulta a previsão por usuário, converte pra
 * série de saldo, persiste a rodada e dispara alerta de saldo negativo.
 * Usuário com menos de 6 meses de histórico fica "aguardando dado suficiente".
 */
export async function materializeRuns(
  pipeline: ForecastPipeline,
  mape: number | null,
): Promise<{ ready: number; awaitingData: number; alerts: number }> {
  const users = await listForecastableUsers();
  let ready = 0;
  let awaitingData = 0;
  let alerts = 0;

  for (const { tenantId, userId } of users) {
    const range = await getHistoryRange(tenantId, userId);
    const historyMonths = range ? monthsOfHistory(range.first, range.last) : 0;

    if (!hasEnoughHistory(historyMonths)) {
      await prisma.forecastRun.create({
        data: { tenantId, userId, status: "AWAITING_DATA", historyMonths, openingBalance: 0 },
      });
      awaitingData += 1;
      continue;
    }

    const openingBalance = await getCurrentBalance(tenantId, userId);
    const flows = await queryUserForecast(pipeline.forecastArn!, tenantId, userId);
    const series = toBalanceSeries(openingBalance, flows);

    const run = await prisma.forecastRun.create({
      data: {
        tenantId,
        userId,
        status: "READY",
        historyMonths,
        openingBalance,
        predictorArn: pipeline.predictorArn,
        forecastArn: pipeline.forecastArn,
        mape,
        trainedAt: new Date(),
        points: {
          createMany: {
            data: series.map((point) => ({
              date: new Date(point.date),
              p10: point.p10,
              p50: point.p50,
              p90: point.p90,
            })),
          },
        },
      },
    });
    ready += 1;

    const crossing = firstNegativeP50(series);
    if (crossing) {
      const alert: NegativeBalanceAlert = {
        tenantId,
        userId,
        runId: run.id,
        crossingDate: crossing.point.date,
        projectedBalance: crossing.point.p50,
        leadDays: crossing.leadDays,
        meetsLeadTimeTarget: crossing.leadDays >= MIN_ALERT_LEAD_DAYS,
      };
      // jobId por rodada+usuário: reprocessar o pipeline não alerta duas vezes.
      await getForecastAlertsQueue().add("negative-balance", alert, {
        jobId: `${run.id}:${userId}`,
      });
      alerts += 1;
    }
  }

  return { ready, awaitingData, alerts };
}

async function queryUserForecast(
  forecastArn: string,
  tenantId: string,
  userId: string,
): Promise<DailyFlowQuantiles[]> {
  const response = await getForecastQueryClient().send(
    new QueryForecastCommand({
      ForecastArn: forecastArn,
      Filters: { item_id: buildItemId(tenantId, userId) },
    }),
  );

  const predictions = response.Forecast?.Predictions ?? {};
  return mergeQuantileSeries({
    p10: predictions[QUANTILE_KEYS.p10],
    p50: predictions[QUANTILE_KEYS.p50],
    p90: predictions[QUANTILE_KEYS.p90],
  });
}
