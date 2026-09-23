import { describe, expect, it } from "vitest";
import { buildExportKey, toForecastCsv } from "@/lib/mei-oraculo/export";
import type { DailyNet } from "@/lib/mei-oraculo/series";

const series: DailyNet[] = [
  { date: new Date(Date.UTC(2026, 0, 1)), net: 100 },
  { date: new Date(Date.UTC(2026, 0, 2)), net: -35.5 },
];

describe("toForecastCsv", () => {
  it("usa o formato TARGET_TIME_SERIES do Forecast", () => {
    const csv = toForecastCsv("tenant-1:5511999990000", series);
    const lines = csv.split("\n");

    expect(lines[0]).toBe("item_id,timestamp,target_value");
    expect(lines[1]).toBe("tenant-1:5511999990000,2026-01-01,100.00");
    expect(lines[2]).toBe("tenant-1:5511999990000,2026-01-02,-35.50");
  });

  it("gera arquivo vazio de dados, mas com cabeçalho, sem série", () => {
    expect(toForecastCsv("x", [])).toBe("item_id,timestamp,target_value");
  });
});

describe("buildExportKey", () => {
  it("particiona por tenant, usuário e data", () => {
    const key = buildExportKey("tenant-1", "5511999990000", new Date("2026-09-23T10:00:00Z"));

    expect(key).toBe("forecast/tenant-1/5511999990000/2026-09-23.csv");
  });
});
