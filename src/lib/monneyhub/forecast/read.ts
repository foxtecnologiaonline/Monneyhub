import { prisma } from "@/lib/db";
import {
  bandsAtHorizons,
  firstNegativeP50,
  MIN_HISTORY_MONTHS,
  type BalancePoint,
} from "@/lib/monneyhub/forecast/bands";

export interface ForecastView {
  status: "READY" | "AWAITING_DATA" | "TRAINING" | "FAILED" | "NO_RUN";
  /** Meses de histórico do usuário e quanto ainda falta pro mínimo. */
  historyMonths?: number;
  missingMonths?: number;
  /** Faixa otimista/realista/pessimista em cada horizonte. */
  horizons?: Array<{
    horizonDays: number;
    pessimista: number | null;
    realista: number | null;
    otimista: number | null;
  }>;
  /** Erro percentual médio do preditor — interno, não prometido ao usuário. */
  mape?: number | null;
  negativeBalanceAlert?: {
    crossingDate: string;
    projectedBalance: number;
    leadDays: number;
  } | null;
  trainedAt?: string | null;
}

/** Última rodada do usuário, já traduzida pra faixa por horizonte. */
export async function getLatestForecast(
  tenantId: string,
  userId: string,
): Promise<ForecastView> {
  const run = await prisma.forecastRun.findFirst({
    where: { tenantId, userId },
    orderBy: { createdAt: "desc" },
    include: { points: { orderBy: { date: "asc" } } },
  });

  if (!run) return { status: "NO_RUN" };

  if (run.status !== "READY") {
    return {
      status: run.status,
      historyMonths: run.historyMonths,
      missingMonths: Math.max(0, MIN_HISTORY_MONTHS - run.historyMonths),
    };
  }

  // O treino é semanal, então a rodada pode ter dias de idade. Descartar o
  // passado mantém "em 30/60/90 dias" e a janela do alerta contados a partir
  // de hoje — senão a janela derrapa junto com a idade da rodada.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const series: BalancePoint[] = run.points
    .filter((point) => point.date >= today)
    .map((point) => ({
      date: point.date.toISOString().slice(0, 10),
      p10: point.p10,
      p50: point.p50,
      p90: point.p90,
    }));

  const crossing = firstNegativeP50(series);

  return {
    status: "READY",
    historyMonths: run.historyMonths,
    mape: run.mape,
    trainedAt: run.trainedAt?.toISOString() ?? null,
    horizons: bandsAtHorizons(series).map(({ horizonDays, band }) => ({
      horizonDays,
      pessimista: band?.p10 ?? null,
      realista: band?.p50 ?? null,
      otimista: band?.p90 ?? null,
    })),
    negativeBalanceAlert: crossing
      ? {
          crossingDate: crossing.point.date,
          projectedBalance: crossing.point.p50,
          leadDays: crossing.leadDays,
        }
      : null,
  };
}
