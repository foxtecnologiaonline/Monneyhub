import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    account: { findMany: vi.fn() },
    transaction: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/mei-oraculo/export", () => ({
  isExportConfigured: vi.fn(),
  uploadForecastSeries: vi.fn(),
}));

const addAlertJob = vi.fn();
vi.mock("@/lib/mei-oraculo/queue", () => ({
  getForecastAlertQueue: () => ({ add: addAlertJob }),
}));

vi.mock("@/lib/mei-oraculo/service", () => ({
  loadAccountHistory: vi.fn(),
  buildForecastReportFromHistory: vi.fn(),
  persistForecastRun: vi.fn(),
}));

import { prisma } from "@/lib/db";
import { isExportConfigured, uploadForecastSeries } from "@/lib/mei-oraculo/export";
import {
  loadAccountHistory,
  buildForecastReportFromHistory,
  persistForecastRun,
} from "@/lib/mei-oraculo/service";
import { runWeeklyForecast } from "@/workers/forecast-weekly.worker";
import type { DailyNet } from "@/lib/mei-oraculo/series";

const account = { tenantId: "t1", userId: "u1" };
const series: DailyNet[] = [{ date: new Date("2026-01-01"), net: 10 }];
const history = { currency: "BRL", balance: 500, series };

const okReport = {
  status: "OK" as const,
  historyMonths: 8,
  minHistoryMonths: 6,
  currency: "BRL",
  currentBalance: 500,
  horizons: [],
  alert: null,
  mape: 5,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.account.findMany).mockResolvedValue([account] as never);
  vi.mocked(loadAccountHistory).mockResolvedValue(history);
  vi.mocked(buildForecastReportFromHistory).mockReturnValue(okReport);
  vi.mocked(isExportConfigured).mockReturnValue(false);
});

describe("runWeeklyForecast", () => {
  it("nunca consulta transações direto — reaproveita o histórico do serviço", async () => {
    vi.mocked(isExportConfigured).mockReturnValue(true);
    vi.mocked(uploadForecastSeries).mockResolvedValue("forecast/t1/u1/2026-01-01.csv");

    await runWeeklyForecast();

    // Essa é a garantia da otimização: com export configurado, o export
    // usa a série que já veio de loadAccountHistory, sem reconsultar.
    expect(prisma.transaction.findMany).not.toHaveBeenCalled();
    expect(uploadForecastSeries).toHaveBeenCalledWith({
      tenantId: "t1",
      userId: "u1",
      series,
    });
  });

  it("pula o export quando não está configurado", async () => {
    await runWeeklyForecast();

    expect(uploadForecastSeries).not.toHaveBeenCalled();
    expect(persistForecastRun).toHaveBeenCalledWith({
      tenantId: "t1",
      userId: "u1",
      report: okReport,
      exportKey: null,
    });
  });

  it("enfileira alerta quando o relatório aponta saldo negativo", async () => {
    const alert = { crossesAtDay: 12, leadDays: 12, projectedBalance: -50 };
    vi.mocked(buildForecastReportFromHistory).mockReturnValue({ ...okReport, alert });

    const result = await runWeeklyForecast();

    expect(addAlertJob).toHaveBeenCalledWith("negative-balance", {
      tenantId: "t1",
      userId: "u1",
      crossesAtDay: 12,
      leadDays: 12,
      projectedBalance: -50,
    });
    expect(result).toEqual({ processed: 1, alerts: 1 });
  });

  it("não enfileira alerta quando o relatório não aponta risco", async () => {
    const result = await runWeeklyForecast();

    expect(addAlertJob).not.toHaveBeenCalled();
    expect(result).toEqual({ processed: 1, alerts: 0 });
  });

  it("processa conta sem histórico suficiente sem exportar nem alertar", async () => {
    vi.mocked(loadAccountHistory).mockResolvedValue(null);
    vi.mocked(buildForecastReportFromHistory).mockReturnValue({
      status: "INSUFFICIENT_HISTORY",
      historyMonths: 0,
      minHistoryMonths: 6,
      currency: null,
      currentBalance: null,
      horizons: [],
      alert: null,
      mape: null,
    });
    vi.mocked(isExportConfigured).mockReturnValue(true);

    await runWeeklyForecast();

    expect(uploadForecastSeries).not.toHaveBeenCalled();
    expect(addAlertJob).not.toHaveBeenCalled();
  });
});
