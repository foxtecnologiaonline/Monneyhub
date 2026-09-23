import { describe, expect, it } from "vitest";
import {
  INVESTMENT_DISCLAIMER,
  mentionsInvestment,
  withInvestmentDisclaimer,
} from "@/lib/monneyhub-zap/disclaimer";

describe("mentionsInvestment", () => {
  const investmentTexts = [
    "vale a pena investir em CDB?",
    "quanto rende a poupança?",
    "o CDI subiu esse mês",
    "queria aplicar no tesouro direto",
    "minha carteira de ações caiu",
    "o dólar vai subir?",
    "qual a rentabilidade disso",
    "comprar bitcoin agora?",
  ];

  it.each(investmentTexts)("detecta investimento em: %s", (text) => {
    expect(mentionsInvestment(text)).toBe(true);
  });

  it("não dispara em consulta puramente operacional", () => {
    expect(mentionsInvestment("Seu saldo atual é R$ 1.200,00.")).toBe(false);
    expect(mentionsInvestment("Seus últimos lançamentos: mercado, aluguel")).toBe(false);
  });
});

describe("withInvestmentDisclaimer", () => {
  it("carimba quando a resposta menciona investimento", () => {
    const result = withInvestmentDisclaimer("O CDI está em 10,5% ao ano.", "e o cdi?");
    expect(result).toContain(INVESTMENT_DISCLAIMER);
  });

  it("carimba quando só a pergunta menciona investimento", () => {
    const result = withInvestmentDisclaimer(
      "Prefiro não responder isso por aqui.",
      "onde devo investir meu dinheiro?",
    );
    expect(result).toContain(INVESTMENT_DISCLAIMER);
  });

  it("não carimba consulta de saldo", () => {
    const result = withInvestmentDisclaimer("Seu saldo atual é R$ 10,00.", "qual meu saldo?");
    expect(result).not.toContain(INVESTMENT_DISCLAIMER);
  });

  it("não duplica o disclaimer", () => {
    const once = withInvestmentDisclaimer("Sobre investimento: depende.", "investimento");
    const twice = withInvestmentDisclaimer(once, "investimento");
    expect(twice).toBe(once);
    expect(twice.split(INVESTMENT_DISCLAIMER)).toHaveLength(2);
  });

  it("critério de aceite: 100% das respostas que mencionam investimento levam o aviso", () => {
    const replies = [
      "Investir em renda fixa depende do seu prazo.",
      "A Selic está em 10,75%.",
      "Aplicações em LCI são isentas de IR para pessoa física.",
      "O fundo teve rentabilidade negativa no mês.",
    ];

    for (const reply of replies) {
      expect(withInvestmentDisclaimer(reply, "pergunta qualquer")).toContain(
        INVESTMENT_DISCLAIMER,
      );
    }
  });
});
