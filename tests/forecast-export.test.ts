import { describe, expect, it } from "vitest";
import {
  aggregateDailyNetFlow,
  buildTargetTimeSeriesCsv,
  buildItemId,
  parseItemId,
} from "@/lib/monneyhub/forecast/export";
import { mergeQuantileSeries } from "@/lib/monneyhub/forecast/runs";
import type { ExportableTransaction } from "@/lib/finance/queries";

const base: ExportableTransaction = {
  tenantId: "t1",
  userId: "u1",
  occurredAt: new Date("2026-03-10T00:00:00Z"),
  amount: 100,
};

describe("aggregateDailyNetFlow", () => {
  it("soma entradas e saídas assinadas no mesmo dia", () => {
    const rows = aggregateDailyNetFlow([base, { ...base, amount: -30 }, { ...base, amount: 20 }]);

    expect(rows).toHaveLength(1);
    expect(rows[0]!.netAmount).toBe(90);
    expect(rows[0]!.date).toBe("2026-03-10");
  });

  it("separa séries por tenant e por usuário", () => {
    const rows = aggregateDailyNetFlow([
      base,
      { ...base, userId: "u2" },
      { ...base, tenantId: "t2" },
    ]);

    expect(rows).toHaveLength(3);
    expect(new Set(rows.map((row) => row.itemId)).size).toBe(3);
  });

  it("ordena por item e data", () => {
    const rows = aggregateDailyNetFlow([
      { ...base, occurredAt: new Date("2026-03-12T00:00:00Z") },
      { ...base, occurredAt: new Date("2026-03-11T00:00:00Z") },
    ]);

    expect(rows.map((row) => row.date)).toEqual(["2026-03-11", "2026-03-12"]);
  });
});

describe("buildTargetTimeSeriesCsv", () => {
  it("gera CSV sem cabeçalho, com duas casas decimais", () => {
    const csv = buildTargetTimeSeriesCsv(aggregateDailyNetFlow([base]));

    expect(csv).toBe("t1::u1,2026-03-10,100.00");
  });
});

describe("buildItemId / parseItemId", () => {
  it("faz ida e volta", () => {
    expect(parseItemId(buildItemId("t1", "u1"))).toEqual({ tenantId: "t1", userId: "u1" });
  });

  it("rejeita item_id malformado", () => {
    expect(parseItemId("sem-separador")).toBeNull();
  });
});

describe("mergeQuantileSeries", () => {
  it("junta os três quantis por data", () => {
    const series = mergeQuantileSeries({
      p10: [{ Timestamp: "2026-03-10T00:00:00", Value: -5 }],
      p50: [{ Timestamp: "2026-03-10T00:00:00", Value: 10 }],
      p90: [{ Timestamp: "2026-03-10T00:00:00", Value: 25 }],
    });

    expect(series).toEqual([{ date: "2026-03-10", p10: -5, p50: 10, p90: 25 }]);
  });

  it("preenche com zero o quantil ausente numa data", () => {
    const series = mergeQuantileSeries({
      p50: [{ Timestamp: "2026-03-11T00:00:00", Value: 7 }],
    });

    expect(series[0]).toEqual({ date: "2026-03-11", p10: 0, p50: 7, p90: 0 });
  });
});
