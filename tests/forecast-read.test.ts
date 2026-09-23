import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: { forecastRun: { findFirst: vi.fn() } } }));

import { prisma } from "@/lib/db";
import { getLatestForecast } from "@/lib/monneyhub/forecast/read";

function dayOffset(days: number): Date {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

/** Série de saldo queimando `burn` por dia a partir de `opening`. */
function points(opening: number, burn: number, days: number, startOffset: number) {
  return Array.from({ length: days }, (_, index) => ({
    date: dayOffset(startOffset + index),
    p10: opening - burn * 2 * (index + 1),
    p50: opening - burn * (index + 1),
    p90: opening + 5 * (index + 1),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getLatestForecast", () => {
  it("devolve NO_RUN quando o usuário nunca teve rodada", async () => {
    vi.mocked(prisma.forecastRun.findFirst).mockResolvedValue(null);

    expect(await getLatestForecast("t1", "u1")).toEqual({ status: "NO_RUN" });
  });

  it("informa quantos meses ainda faltam quando está aguardando dado", async () => {
    vi.mocked(prisma.forecastRun.findFirst).mockResolvedValue({
      status: "AWAITING_DATA",
      historyMonths: 2,
      points: [],
    } as never);

    const view = await getLatestForecast("t1", "u1");

    expect(view.status).toBe("AWAITING_DATA");
    expect(view.missingMonths).toBe(4);
  });

  it("expõe faixa nos três horizontes e o MAPE", async () => {
    vi.mocked(prisma.forecastRun.findFirst).mockResolvedValue({
      status: "READY",
      historyMonths: 8,
      mape: 11.2,
      trainedAt: new Date(),
      points: points(10000, 10, 90, 1),
    } as never);

    const view = await getLatestForecast("t1", "u1");

    expect(view.horizons?.map((h) => h.horizonDays)).toEqual([30, 60, 90]);
    expect(view.horizons?.[0]?.realista).toBe(10000 - 10 * 30);
    expect(view.mape).toBe(11.2);
    expect(view.negativeBalanceAlert).toBeNull();
  });

  it("detecta o cruzamento de zero dentro da janela de 30 dias", async () => {
    vi.mocked(prisma.forecastRun.findFirst).mockResolvedValue({
      status: "READY",
      historyMonths: 8,
      mape: null,
      trainedAt: new Date(),
      // 300 queimando 15/dia: cruza zero no 21º dia.
      points: points(300, 15, 90, 1),
    } as never);

    const view = await getLatestForecast("t1", "u1");

    expect(view.negativeBalanceAlert?.leadDays).toBe(21);
    expect(view.negativeBalanceAlert!.leadDays).toBeGreaterThanOrEqual(15);
  });

  it("conta horizonte e janela a partir de hoje, não da data do treino", async () => {
    // Rodada de 7 dias atrás: os 7 primeiros pontos já passaram. Sem
    // descartar o passado, "em 30 dias" apontaria pro dia 23 e a janela de
    // alerta perderia os últimos 7 dias.
    vi.mocked(prisma.forecastRun.findFirst).mockResolvedValue({
      status: "READY",
      historyMonths: 8,
      mape: null,
      trainedAt: dayOffset(-7),
      points: points(10000, 10, 90, -6),
    } as never);

    const view = await getLatestForecast("t1", "u1");

    // O ponto de hoje é o 7º da série (índice 6): saldo 10000 − 10×7.
    expect(view.horizons?.[0]?.realista).toBe(10000 - 10 * (7 + 29));
    expect(view.horizons?.[2]?.realista).toBeNull(); // série futura só tem 84 dias
  });
});
