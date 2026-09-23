import { describe, expect, it } from "vitest";
import { forecastBalance, HORIZON_DAYS } from "@/lib/mei-oraculo/forecast";
import { findNegativeBalanceAlert, MIN_ALERT_LEAD_DAYS } from "@/lib/mei-oraculo/alert";
import type { DailyNet } from "@/lib/mei-oraculo/series";

function series(nets: number[]): DailyNet[] {
  return nets.map((net, index) => ({
    date: new Date(Date.UTC(2026, 0, index + 1)),
    net,
  }));
}

describe("forecastBalance", () => {
  it("projeta os três horizontes do escopo", () => {
    const result = forecastBalance({ currentBalance: 1000, series: series([10, 10, 10]) });

    expect(result.horizons.map((h) => h.horizonDays)).toEqual([...HORIZON_DAYS]);
  });

  it("segue a deriva média do histórico", () => {
    const result = forecastBalance({ currentBalance: 1000, series: series([10, 10, 10, 10]) });

    // 10/dia por 30 dias sobre saldo 1000.
    expect(result.horizons[0]!.p50).toBeCloseTo(1300, 5);
  });

  it("mantém a ordem pessimista < realista < otimista", () => {
    const result = forecastBalance({ currentBalance: 1000, series: series([50, -30, 20, -10, 40]) });

    for (const horizon of result.horizons) {
      expect(horizon.p10).toBeLessThan(horizon.p50);
      expect(horizon.p50).toBeLessThan(horizon.p90);
    }
  });

  it("abre a faixa conforme o horizonte cresce — 90 dias é mais incerto que 30", () => {
    const result = forecastBalance({ currentBalance: 1000, series: series([50, -30, 20, -10, 40]) });
    const [d30, d60, d90] = result.horizons;

    const width = (h: { p10: number; p90: number }) => h.p90 - h.p10;
    expect(width(d60!)).toBeGreaterThan(width(d30!));
    expect(width(d90!)).toBeGreaterThan(width(d60!));
  });

  it("não abre faixa quando o fluxo é constante — não há incerteza a comunicar", () => {
    const result = forecastBalance({ currentBalance: 1000, series: series([10, 10, 10, 10]) });

    expect(result.horizons[0]!.p10).toBeCloseTo(result.horizons[0]!.p90, 5);
  });

  it("gera caminho diário até o maior horizonte", () => {
    const result = forecastBalance({ currentBalance: 1000, series: series([10, 10]) });

    expect(result.medianPath).toHaveLength(90);
  });
});

describe("findNegativeBalanceAlert", () => {
  it("não alerta quando o saldo mediano nunca cruza zero", () => {
    const result = forecastBalance({ currentBalance: 5000, series: series([10, 10, 10]) });

    expect(findNegativeBalanceAlert(result.medianPath)).toBeNull();
  });

  it("alerta quando o saldo mediano fica negativo dentro de 30 dias", () => {
    // Saldo 300, queimando 20/dia: zera por volta do dia 15.
    const result = forecastBalance({ currentBalance: 300, series: series([-20, -20, -20]) });

    const alert = findNegativeBalanceAlert(result.medianPath);

    expect(alert).not.toBeNull();
    expect(alert!.crossesAtDay).toBe(16);
    expect(alert!.projectedBalance).toBeLessThan(0);
  });

  it("ignora cruzamento que só acontece depois da janela de 30 dias", () => {
    // Saldo 1000, queimando 20/dia: cruza por volta do dia 50.
    const result = forecastBalance({ currentBalance: 1000, series: series([-20, -20, -20]) });

    expect(findNegativeBalanceAlert(result.medianPath, 30)).toBeNull();
    expect(findNegativeBalanceAlert(result.medianPath, 90)).not.toBeNull();
  });

  it("critério de aceite: cruzamento no fim da janela dá 15+ dias de antecedência", () => {
    // Saldo 400, queimando 20/dia: cruza no dia 21.
    const result = forecastBalance({ currentBalance: 400, series: series([-20, -20, -20]) });
    const alert = findNegativeBalanceAlert(result.medianPath);

    expect(alert!.leadDays).toBeGreaterThanOrEqual(MIN_ALERT_LEAD_DAYS);
  });
});
