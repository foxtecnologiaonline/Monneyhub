import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/finance/queries", () => ({
  getAccountSummary: vi.fn(),
  getRecentTransactions: vi.fn(),
}));

vi.mock("@/lib/perplexity/router", () => ({
  askMarketQuestion: vi.fn(),
  isRouterConfigured: vi.fn(() => true),
}));

vi.mock("@/lib/safety/content-safety", () => ({
  analyzeOutboundText: vi.fn(),
}));

vi.mock("@/lib/monneyhub/forecast/read", () => ({ getLatestForecast: vi.fn() }));

import { getAccountSummary, getRecentTransactions } from "@/lib/finance/queries";
import { getLatestForecast } from "@/lib/monneyhub/forecast/read";
import { askMarketQuestion, isRouterConfigured } from "@/lib/perplexity/router";
import { analyzeOutboundText } from "@/lib/safety/content-safety";
import { monneyhubZapHandler } from "@/lib/handlers/monneyhub-zap";
import { INVESTMENT_DISCLAIMER } from "@/lib/monneyhub-zap/disclaimer";
import type { NormalizedMessage } from "@/lib/handlers/types";

function message(text: string): NormalizedMessage {
  return {
    tenantId: "tenant-1",
    phoneNumberId: "1234567890",
    userId: "5511999990000",
    messageId: `wamid.${Math.random()}`,
    text,
    timestamp: new Date().toISOString(),
    raw: {},
  };
}

const allowed = { allowed: true, status: "analyzed" as const, maxSeverity: 0 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isRouterConfigured).mockReturnValue(true);
  vi.mocked(analyzeOutboundText).mockResolvedValue(allowed);
});

describe("monneyhubZapHandler — dado interno", () => {
  it("responde saldo formatado em reais", async () => {
    vi.mocked(getAccountSummary).mockResolvedValue({
      balance: "1200.50",
      currency: "BRL",
    });

    const result = await monneyhubZapHandler(message("qual meu saldo?"));

    expect(result.replyText).toContain("R$ 1200,50");
    expect(result.meta).toMatchObject({ intent: "BALANCE", modelGenerated: false });
    expect(askMarketQuestion).not.toHaveBeenCalled();
  });

  it("avisa quando não há conta vinculada ao número", async () => {
    vi.mocked(getAccountSummary).mockResolvedValue(null);

    const result = await monneyhubZapHandler(message("qual meu saldo?"));

    expect(result.replyText).toContain("Não encontrei uma conta");
  });

  it("lista os últimos lançamentos", async () => {
    vi.mocked(getRecentTransactions).mockResolvedValue([
      { description: "Mercado", amount: "-150.00", occurredAt: new Date("2026-09-20T12:00:00Z") },
    ]);

    const result = await monneyhubZapHandler(message("me manda o extrato"));

    expect(result.replyText).toContain("Mercado");
    expect(result.meta).toMatchObject({ intent: "STATEMENT" });
  });

  it("devolve a previsão do MEI-Oráculo como faixa, não número único", async () => {
    vi.mocked(getLatestForecast).mockResolvedValue({
      status: "READY",
      horizons: [{ horizonDays: 30, pessimista: 100, realista: 500, otimista: 900 }],
      negativeBalanceAlert: null,
    });

    const result = await monneyhubZapHandler(message("qual a previsão do meu fluxo de caixa?"));

    expect(result.replyText).toContain("500,00");
    expect(result.replyText).toContain("100,00");
    expect(result.replyText).toContain("900,00");
    expect(result.meta).toMatchObject({ intent: "FORECAST", modelGenerated: false });
    expect(askMarketQuestion).not.toHaveBeenCalled();
  });

  it("explica quando ainda não há histórico suficiente pra previsão", async () => {
    vi.mocked(getLatestForecast).mockResolvedValue({
      status: "AWAITING_DATA",
      historyMonths: 2,
      missingMonths: 4,
    });

    const result = await monneyhubZapHandler(message("como fica meu fluxo de caixa?"));

    expect(result.replyText).toContain("histórico suficiente");
    expect(result.replyText).toContain("4");
  });
});

describe("monneyhubZapHandler — pergunta de mercado", () => {
  it("consulta a Router API e carimba o disclaimer", async () => {
    vi.mocked(askMarketQuestion).mockResolvedValue({
      text: "O CDI está em 10,5% ao ano.",
      citations: [],
    });

    const result = await monneyhubZapHandler(message("quanto está o CDI?"));

    expect(askMarketQuestion).toHaveBeenCalledOnce();
    expect(result.replyText).toContain(INVESTMENT_DISCLAIMER);
    expect(result.meta).toMatchObject({ intent: "MARKET", modelGenerated: true });
  });

  it("degrada com mensagem própria quando a Router API falha", async () => {
    vi.mocked(askMarketQuestion).mockRejectedValue(new Error("timeout"));

    const result = await monneyhubZapHandler(message("quanto está o CDI?"));

    expect(result.replyText).toContain("Não consegui buscar");
    expect(result.meta).toMatchObject({ modelGenerated: false });
  });

  it("não chama a Router API quando ela não está configurada", async () => {
    vi.mocked(isRouterConfigured).mockReturnValue(false);

    const result = await monneyhubZapHandler(message("quanto está o CDI?"));

    expect(askMarketQuestion).not.toHaveBeenCalled();
    expect(result.replyText).toContain("Não consegui buscar");
  });
});

describe("monneyhubZapHandler — guarda de conteúdo", () => {
  it("substitui a resposta quando o Content Safety bloqueia", async () => {
    vi.mocked(askMarketQuestion).mockResolvedValue({ text: "conteúdo problemático", citations: [] });
    vi.mocked(analyzeOutboundText).mockResolvedValue({
      allowed: false,
      status: "analyzed",
      maxSeverity: 6,
    });

    const result = await monneyhubZapHandler(message("me fala algo"));

    expect(result.replyText).toContain("Prefiro não responder");
    expect(result.meta).toMatchObject({ blocked: true });
  });

  it("falha fechado em texto gerado por modelo e aberto em texto interno", async () => {
    vi.mocked(askMarketQuestion).mockResolvedValue({ text: "resposta do modelo", citations: [] });
    await monneyhubZapHandler(message("quanto está o CDI?"));
    expect(vi.mocked(analyzeOutboundText).mock.calls[0]?.[1]).toMatchObject({ failClosed: true });

    vi.mocked(analyzeOutboundText).mockClear();
    vi.mocked(getAccountSummary).mockResolvedValue({
      balance: "10.00",
      currency: "BRL",
    });
    await monneyhubZapHandler(message("qual meu saldo?"));
    expect(vi.mocked(analyzeOutboundText).mock.calls[0]?.[1]).toMatchObject({ failClosed: false });
  });

  it("toda resposta passa pela guarda antes de sair", async () => {
    vi.mocked(getAccountSummary).mockResolvedValue({
      balance: "10.00",
      currency: "BRL",
    });

    await monneyhubZapHandler(message("qual meu saldo?"));

    expect(analyzeOutboundText).toHaveBeenCalledOnce();
  });
});
