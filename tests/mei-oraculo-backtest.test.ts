import { describe, expect, it } from "vitest";
import { backtest, mape } from "@/lib/mei-oraculo/backtest";
import { MIN_ALERT_LEAD_DAYS } from "@/lib/mei-oraculo/alert";
import type { DailyNet } from "@/lib/mei-oraculo/series";

function series(nets: number[]): DailyNet[] {
  return nets.map((net, index) => ({
    date: new Date(Date.UTC(2026, 0, index + 1)),
    net,
  }));
}

describe("mape", () => {
  it("é zero quando a previsão bate exatamente", () => {
    expect(mape([100, 200, 300], [100, 200, 300])).toBe(0);
  });

  it("calcula o erro percentual médio", () => {
    // 10% e 20% -> média 15%.
    expect(mape([100, 100], [110, 120])).toBeCloseTo(15, 5);
  });

  it("descarta ponto com saldo quase zero em vez de estourar", () => {
    expect(mape([0.5, 100], [10, 110])).toBeCloseTo(10, 5);
  });

  it("devolve null quando não sobra ponto medível", () => {
    expect(mape([0, 0], [5, 5])).toBeNull();
  });
});

describe("backtest", () => {
  it("não mede com histórico menor que a janela de teste", () => {
    const result = backtest({ series: series([10, 10]), currentBalance: 100, horizonDays: 30 });

    expect(result.mape).toBeNull();
    expect(result.testDays).toBe(0);
    expect(result.meetsLeadRequirement).toBe(false);
  });

  it("acerta com erro baixo quando o fluxo é estável", () => {
    const stable = Array.from({ length: 120 }, () => 10);
    const result = backtest({ series: series(stable), currentBalance: 1200, horizonDays: 30 });

    expect(result.mape).not.toBeNull();
    expect(result.mape!).toBeLessThan(1);
  });

  it("critério de aceite: prevê saldo negativo com 15+ dias de antecedência", () => {
    // 90 dias queimando 20/dia, terminando negativo em -100. No corte havia
    // 500, então o saldo real cruza zero no dia 26 da janela de teste — e a
    // previsão feita no corte precisa ter avisado com essa antecedência.
    const burn = Array.from({ length: 90 }, () => -20);
    const result = backtest({ series: series(burn), currentBalance: -100, horizonDays: 30 });

    expect(result.actualFirstNegativeDay).not.toBeNull();
    expect(result.predictedAlertDay).not.toBeNull();
    expect(result.alertLeadDays).toBeGreaterThanOrEqual(MIN_ALERT_LEAD_DAYS);
    expect(result.meetsLeadRequirement).toBe(true);
  });

  it("não inventa alerta quando o saldo se mantém positivo", () => {
    const healthy = Array.from({ length: 120 }, () => 50);
    const result = backtest({ series: series(healthy), currentBalance: 6000, horizonDays: 30 });

    expect(result.actualFirstNegativeDay).toBeNull();
    expect(result.alertLeadDays).toBeNull();
  });
});
