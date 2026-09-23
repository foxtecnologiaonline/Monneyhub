import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import {
  buildDailyNetSeries,
  hasEnoughHistory,
  historyMonths,
  MIN_HISTORY_MONTHS,
  type DailyNet,
} from "@/lib/mei-oraculo/series";
import { forecastBalance, type HorizonForecast } from "@/lib/mei-oraculo/forecast";
import { findNegativeBalanceAlert, type NegativeBalanceAlert } from "@/lib/mei-oraculo/alert";
import { backtest } from "@/lib/mei-oraculo/backtest";

export type ForecastStatus = "OK" | "INSUFFICIENT_HISTORY" | "NO_ACCOUNT";

export interface ForecastReport {
  status: ForecastStatus;
  historyMonths: number;
  minHistoryMonths: number;
  currency: string | null;
  currentBalance: number | null;
  horizons: HorizonForecast[];
  alert: NegativeBalanceAlert | null;
  /** Precisão medida em teste retroativo, em % — null quando não dá pra medir. */
  mape: number | null;
}

interface AccountHistory {
  currency: string;
  balance: number;
  series: DailyNet[];
}

async function loadHistory(tenantId: string, userId: string): Promise<AccountHistory | null> {
  const account = await prisma.account.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    select: {
      currency: true,
      transactions: {
        orderBy: { occurredAt: "asc" },
        select: { amount: true, occurredAt: true },
      },
    },
  });

  if (!account) return null;

  // Saldo derivado da soma das transações, não materializado na conta —
  // é o mesmo lote de linhas que a série diária já precisa ler, então sai
  // de graça e nunca diverge do extrato.
  const balance = account.transactions.reduce((sum, item) => sum + item.amount.toNumber(), 0);

  return {
    currency: account.currency,
    balance,
    series: buildDailyNetSeries(
      account.transactions.map((item) => ({
        amount: item.amount.toFixed(2),
        occurredAt: item.occurredAt,
      })),
    ),
  };
}

/**
 * Previsão de saldo em faixa (P10/P50/P90) para 30/60/90 dias, com alerta
 * quando o caminho mediano cruza zero em 30 dias. Sem histórico suficiente
 * o produto não chuta: devolve INSUFFICIENT_HISTORY e nenhuma faixa.
 */
export async function buildForecastReport(
  tenantId: string,
  userId: string,
): Promise<ForecastReport> {
  const history = await loadHistory(tenantId, userId);

  if (!history) {
    return {
      status: "NO_ACCOUNT",
      historyMonths: 0,
      minHistoryMonths: MIN_HISTORY_MONTHS,
      currency: null,
      currentBalance: null,
      horizons: [],
      alert: null,
      mape: null,
    };
  }

  const months = historyMonths(history.series);

  if (!hasEnoughHistory(history.series)) {
    return {
      status: "INSUFFICIENT_HISTORY",
      historyMonths: months,
      minHistoryMonths: MIN_HISTORY_MONTHS,
      currency: history.currency,
      currentBalance: history.balance,
      horizons: [],
      alert: null,
      mape: null,
    };
  }

  const forecast = forecastBalance({
    currentBalance: history.balance,
    series: history.series,
  });

  const measured = backtest({ series: history.series, currentBalance: history.balance });

  return {
    status: "OK",
    historyMonths: months,
    minHistoryMonths: MIN_HISTORY_MONTHS,
    currency: history.currency,
    currentBalance: history.balance,
    horizons: forecast.horizons,
    alert: findNegativeBalanceAlert(forecast.medianPath),
    mape: measured.mape,
  };
}

/** Persiste a execução — é o registro que expõe a precisão internamente. */
export async function persistForecastRun(params: {
  tenantId: string;
  userId: string;
  report: ForecastReport;
  exportKey: string | null;
}): Promise<void> {
  const { report } = params;

  await prisma.forecastRun.create({
    data: {
      tenantId: params.tenantId,
      userId: params.userId,
      status: report.status,
      horizons: report.horizons as unknown as Prisma.InputJsonValue,
      historyMonths: report.historyMonths.toFixed(2),
      mape: report.mape === null ? null : report.mape.toFixed(2),
      alertLeadDays: report.alert?.leadDays ?? null,
      alertAtDay: report.alert?.crossesAtDay ?? null,
      exportKey: params.exportKey,
    },
  });
}
