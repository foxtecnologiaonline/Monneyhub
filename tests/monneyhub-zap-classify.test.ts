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
});
