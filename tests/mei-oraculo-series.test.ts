import { describe, expect, it } from "vitest";
import {
  buildDailyNetSeries,
  hasEnoughHistory,
  historyMonths,
  MIN_HISTORY_MONTHS,
} from "@/lib/mei-oraculo/series";

function day(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

describe("buildDailyNetSeries", () => {
  it("devolve série vazia sem lançamento", () => {
    expect(buildDailyNetSeries([])).toEqual([]);
  });

  it("soma lançamentos do mesmo dia", () => {
    const series = buildDailyNetSeries([
      { amount: "100.00", occurredAt: day("2026-01-01") },
      { amount: "-30.00", occurredAt: day("2026-01-01") },
    ]);

    expect(series).toHaveLength(1);
    expect(series[0]!.net).toBe(70);
  });

  it("preenche com zero os dias sem lançamento", () => {
    const series = buildDailyNetSeries([
      { amount: "100.00", occurredAt: day("2026-01-01") },
      { amount: "50.00", occurredAt: day("2026-01-05") },
    ]);

    expect(series).toHaveLength(5);
    expect(series.map((point) => point.net)).toEqual([100, 0, 0, 0, 50]);
  });
});

describe("historyMonths / hasEnoughHistory", () => {
  it("reprova histórico curto", () => {
    const series = buildDailyNetSeries([
      { amount: "10.00", occurredAt: day("2026-01-01") },
      { amount: "10.00", occurredAt: day("2026-02-01") },
    ]);

    expect(historyMonths(series)).toBeLessThan(MIN_HISTORY_MONTHS);
    expect(hasEnoughHistory(series)).toBe(false);
  });

  it("aprova a partir de 6 meses", () => {
    const series = buildDailyNetSeries([
      { amount: "10.00", occurredAt: day("2026-01-01") },
      { amount: "10.00", occurredAt: day("2026-07-10") },
    ]);

    expect(hasEnoughHistory(series)).toBe(true);
  });
});
