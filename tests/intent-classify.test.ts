import { describe, expect, it, beforeEach, afterAll } from "vitest";
import { classifyByKeyword, classifyIntent } from "@/lib/intent/classify";

describe("classifyByKeyword", () => {
  // Finança não tem regra aqui de propósito: o assistente financeiro é o
  // ZapMonney, noutro repo e noutro canal. Este teste existe para a remoção não
  // ser revertida sem alguém ler o porquê.
  it("não roteia assunto financeiro para produto nenhum deste gateway", () => {
    expect(classifyByKeyword("qual meu saldo hoje?")).toBe("personai");
    expect(classifyByKeyword("preciso do extrato do MEI")).toBe("personai");
  });

  it("identifica normas-ia por termos regulatórios", () => {
    expect(classifyByKeyword("essa norma de compliance mudou?")).toBe("normas-ia");
  });

  it("identifica sales-agent por termos comerciais", () => {
    expect(classifyByKeyword("quero um orçamento pra contratar o plano")).toBe("sales-agent");
  });

  it("cai em personai por padrão", () => {
    expect(classifyByKeyword("bom dia, tudo bem?")).toBe("personai");
  });
});

describe("classifyIntent", () => {
  const original = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
  });

  afterAll(() => {
    if (original) process.env.ANTHROPIC_API_KEY = original;
  });

  it("usa o fallback por keyword quando não há ANTHROPIC_API_KEY", async () => {
    await expect(classifyIntent("essa norma de compliance mudou?")).resolves.toBe("normas-ia");
  });
});
