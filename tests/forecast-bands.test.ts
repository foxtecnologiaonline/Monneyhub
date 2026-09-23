import { describe, expect, it } from "vitest";
import {
  toBalanceSeries,
  bandAtHorizon,
  bandsAtHorizons,
  firstNegativeP50,
  monthsOfHistory,
  hasEnoughHistory,
  meanAbsolutePercentageError,
  type DailyFlowQuantiles,
} from "@/lib/monneyhub/forecast/bands";

function flowSeries(days: number, daily: { p10: number; p50: number; p90: number }) {
  const out: DailyFlowQuantiles[] = [];
  for (let day = 1; day <= days; day += 1) {
    const date = new Date(Date.UTC(2026, 0, day)).toISOString().slice(0, 10);
    out.push({ date, ...daily });
  }
  return out;
}

describe("toBalanceSeries", () => {
  it("acumula o fluxo diário a partir do saldo de abertura", () => {
    const series = toBalanceSeries(1000, flowSeries(3, { p10: -100, p50: -50, p90: 20 }));

    expect(series).toHaveLength(3);
    expect(series[0]).toMatchObject({ p10: 900, p50: 950, p90: 1020 });
    expect(series[2]).toMatchObject({ p10: 700, p50: 850, p90: 1060 });
  });

  it("ordena por data antes de acumular", () => {
    const series = toBalanceSeries(0, [
      { date: "2026-01-03", p10: 3, p50: 3, p90: 3 },
      { date: "2026-01-01", p10: 1, p50: 1, p90: 1 },
      { date: "2026-01-02", p10: 2, p50: 2, p90: 2 },
    ]);

    expect(series.map((point) => point.date)).toEqual([
      "2026-01-01",
      "2026-01-02",
      "2026-01-03",
    ]);
    expect(series[2]!.p50).toBe(6);
  });
});

describe("bandAtHorizon", () => {
  const series = toBalanceSeries(0, flowSeries(90, { p10: -1, p50: 1, p90: 3 }));

  it("devolve o ponto do dia pedido (série 1-indexada)", () => {
    expect(bandAtHorizon(series, 30)?.p50).toBe(30);
    expect(bandAtHorizon(series, 90)?.p50).toBe(90);
  });

  it("devolve null quando a série é mais curta que o horizonte", () => {
    expect(bandAtHorizon(toBalanceSeries(0, flowSeries(10, { p10: 0, p50: 0, p90: 0 })), 30)).toBeNull();
  });

  it("expõe os três horizontes do escopo", () => {
    expect(bandsAtHorizons(series).map((entry) => entry.horizonDays)).toEqual([30, 60, 90]);
  });
});

describe("firstNegativeP50", () => {
  it("acha o primeiro dia em que o cenário realista fica negativo", () => {
    // Saldo 100, queimando 10/dia: cruza zero no 11º dia.
    const series = toBalanceSeries(100, flowSeries(30, { p10: -20, p50: -10, p90: 0 }));

    const crossing = firstNegativeP50(series);

    expect(crossing?.leadDays).toBe(11);
    expect(crossing?.point.p50).toBeLessThan(0);
  });

  it("não alerta quando o saldo se mantém positivo na janela", () => {
    const series = toBalanceSeries(1000, flowSeries(30, { p10: -1, p50: 5, p90: 10 }));

    expect(firstNegativeP50(series)).toBeNull();
  });

  it("ignora cruzamento fora da janela de 30 dias", () => {
    // Só fica negativo no dia 41 — fora da janela de alerta.
    const series = toBalanceSeries(400, flowSeries(90, { p10: -20, p50: -10, p90: 0 }));

    expect(firstNegativeP50(series, 30)).toBeNull();
    expect(firstNegativeP50(series, 90)?.leadDays).toBe(41);
  });

  it("dá antecedência suficiente pro critério de aceite (15 dias)", () => {
    // Saldo 200 queimando 10/dia: cruza no dia 21, com 21 dias de antecedência.
    const series = toBalanceSeries(200, flowSeries(30, { p10: -20, p50: -10, p90: 0 }));

    expect(firstNegativeP50(series)!.leadDays).toBeGreaterThanOrEqual(15);
  });
});

describe("monthsOfHistory / hasEnoughHistory", () => {
  it("conta meses completos", () => {
    expect(monthsOfHistory(new Date("2026-01-15"), new Date("2026-07-15"))).toBe(6);
    expect(monthsOfHistory(new Date("2026-01-15"), new Date("2026-07-14"))).toBe(5);
  });

  it("aplica o gate de 6 meses", () => {
    expect(hasEnoughHistory(6)).toBe(true);
    expect(hasEnoughHistory(5)).toBe(false);
  });
});

describe("meanAbsolutePercentageError", () => {
  it("calcula o erro percentual médio", () => {
    const mape = meanAbsolutePercentageError([
      { actual: 100, predicted: 90 },
      { actual: 200, predicted: 220 },
    ]);

    expect(mape).toBeCloseTo(10, 5);
  });

  it("ignora dias com valor real zero em vez de dividir por zero", () => {
    const mape = meanAbsolutePercentageError([
      { actual: 0, predicted: 50 },
      { actual: 100, predicted: 80 },
    ]);

    expect(mape).toBeCloseTo(20, 5);
  });

  it("devolve null quando não há par comparável", () => {
    expect(meanAbsolutePercentageError([{ actual: 0, predicted: 10 }])).toBeNull();
  });
});
