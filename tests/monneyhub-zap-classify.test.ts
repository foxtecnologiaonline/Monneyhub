import { describe, expect, it } from "vitest";
import { classifyZapIntent } from "@/lib/monneyhub-zap/classify";

describe("classifyZapIntent", () => {
  it("identifica consulta de saldo", () => {
    expect(classifyZapIntent("qual meu saldo?")).toBe("BALANCE");
    expect(classifyZapIntent("quanto eu tenho disponível em conta")).toBe("BALANCE");
  });

  it("identifica extrato/lançamentos", () => {
    expect(classifyZapIntent("me manda o extrato")).toBe("STATEMENT");
    expect(classifyZapIntent("quais foram os últimos lançamentos?")).toBe("STATEMENT");
  });

  it("trata extrato como extrato mesmo citando saldo", () => {
    expect(classifyZapIntent("quero o extrato do saldo")).toBe("STATEMENT");
  });

  it("manda pergunta livre de mercado pra MARKET", () => {
    expect(classifyZapIntent("quanto está o CDI hoje?")).toBe("MARKET");
    expect(classifyZapIntent("vale a pena abrir MEI esse ano?")).toBe("MARKET");
  });

  it("identifica pedido de previsão", () => {
    expect(classifyZapIntent("como fica meu fluxo de caixa nos próximos 30 dias?")).toBe(
      "FORECAST",
    );
    expect(classifyZapIntent("vou ficar no vermelho esse mês?")).toBe("FORECAST");
    expect(classifyZapIntent("vai dar pra pagar as contas mês que vem?")).toBe("FORECAST");
    expect(classifyZapIntent("como fecha o mês?")).toBe("FORECAST");
  });

  it("trata previsão como previsão mesmo citando saldo/extrato", () => {
    expect(classifyZapIntent("qual a previsão do meu saldo pros próximos 60 dias?")).toBe(
      "FORECAST",
    );
  });
});
