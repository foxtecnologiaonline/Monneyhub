import { describe, expect, it } from "vitest";
import { formatMoney } from "@/lib/finance/format";

describe("formatMoney", () => {
  it("formata em reais com separador de milhar", () => {
    expect(formatMoney("1200.50", "BRL")).toBe("R$ 1.200,50");
  });

  it("formata em dólar", () => {
    expect(formatMoney("1500.00", "USD")).toContain("1.500,00");
  });

  it("cai no fallback quando a moeda não é um código ISO válido", () => {
    expect(formatMoney("10.00", "XYZ_INVALIDO")).toBe("XYZ_INVALIDO 10,00");
  });
});
