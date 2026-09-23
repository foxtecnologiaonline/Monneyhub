import { describe, expect, it } from "vitest";
import {
  classifyFinancialIntent,
  applyInvestmentDisclaimer,
  touchesInvestment,
  INVESTMENT_DISCLAIMER,
} from "@/lib/monneyhub/zap/rules";

describe("classifyFinancialIntent", () => {
  it("reconhece consulta de saldo", () => {
    expect(classifyFinancialIntent("qual meu saldo hoje?")).toBe("BALANCE");
    expect(classifyFinancialIntent("quanto eu tenho na conta?")).toBe("BALANCE");
  });

  it("reconhece pedido de extrato", () => {
    expect(classifyFinancialIntent("me manda o extrato")).toBe("STATEMENT");
    expect(classifyFinancialIntent("quais foram meus últimos lançamentos?")).toBe("STATEMENT");
  });

  it("reconhece pedido de previsão", () => {
    expect(classifyFinancialIntent("como fica meu fluxo de caixa?")).toBe("FORECAST");
    expect(classifyFinancialIntent("vou ficar no vermelho esse mês?")).toBe("FORECAST");
  });

  it("manda pergunta aberta de mercado pro caminho externo", () => {
    expect(classifyFinancialIntent("quanto está o CDI hoje?")).toBe("MARKET");
    expect(classifyFinancialIntent("vale a pena abrir MEI ou ME?")).toBe("MARKET");
  });
});

describe("applyInvestmentDisclaimer", () => {
  it("adiciona o disclaimer quando a resposta fala de investimento", () => {
    const reply = applyInvestmentDisclaimer("O CDI está em 10,5% ao ano.");

    expect(reply).toContain(INVESTMENT_DISCLAIMER);
  });

  it("adiciona o disclaimer quando só a pergunta fala de investimento", () => {
    const reply = applyInvestmentDisclaimer("Não tenho esse dado agora.", "onde aplicar meu dinheiro?");

    expect(reply).toContain(INVESTMENT_DISCLAIMER);
  });

  it("não adiciona em resposta que não toca investimento", () => {
    const reply = applyInvestmentDisclaimer("Seu saldo atual é R$ 1.200,00.");

    expect(reply).not.toContain(INVESTMENT_DISCLAIMER);
  });

  it("não duplica o disclaimer", () => {
    const once = applyInvestmentDisclaimer("Renda fixa rende conforme o CDI.");
    const twice = applyInvestmentDisclaimer(once);

    expect(twice.match(new RegExp(INVESTMENT_DISCLAIMER, "g"))).toHaveLength(1);
  });

  it("cobre os termos de investimento do critério de aceite", () => {
    const termos = [
      "investimento",
      "aplicação",
      "rentabilidade",
      "CDI",
      "Selic",
      "Tesouro Direto",
      "CDB",
      "fundo",
      "ações",
      "bitcoin",
      "poupança",
    ];

    for (const termo of termos) {
      expect(touchesInvestment(`falando sobre ${termo} agora`)).toBe(true);
    }
  });
});
