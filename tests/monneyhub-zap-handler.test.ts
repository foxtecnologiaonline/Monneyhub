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

vi.mock("@/lib/mei-oraculo/service", () => ({
  buildForecastReport: vi.fn(),
}));

import { getAccountSummary, getRecentTransactions } from "@/lib/finance/queries";
import { askMarketQuestion, isRouterConfigured } from "@/lib/perplexity/router";
import { analyzeOutboundText } from "@/lib/safety/content-safety";
import { buildForecastReport } from "@/lib/mei-oraculo/service";
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

    expect(result.replyText).toContain("R$ 1.200,50");
    expect(result.meta).toMatchObject({ intent: "BALANCE", modelGenerated: false });
    expect(askMarketQuestion).not.toHaveBeenCalled();
  });

  it("usa a moeda da conta, não real fixo, no extrato", async () => {
    vi.mocked(getRecentTransactions).mockResolvedValue({
      currency: "USD",
      transactions: [
        { description: "Stripe", amount: "1500.00", occurredAt: new Date("2026-09-20T12:00:00Z") },
      ],
    });

    const result = await monneyhubZapHandler(message("me manda o extrato"));

    expect(result.replyText).toContain("US$");
    expect(result.replyText).not.toContain("R$");
  });

  it("avisa quando não há conta vinculada ao número", async () => {
    vi.mocked(getAccountSummary).mockResolvedValue(null);

    const result = await monneyhubZapHandler(message("qual meu saldo?"));

    expect(result.replyText).toContain("Não encontrei uma conta");
  });

  it("lista os últimos lançamentos", async () => {
    vi.mocked(getRecentTransactions).mockResolvedValue({
      currency: "BRL",
      transactions: [
        { description: "Mercado", amount: "-150.00", occurredAt: new Date("2026-09-20T12:00:00Z") },
      ],
    });

    const result = await monneyhubZapHandler(message("me manda o extrato"));

    expect(result.replyText).toContain("Mercado");
    expect(result.meta).toMatchObject({ intent: "STATEMENT" });
  });
});

describe("monneyhubZapHandler — previsão (MEI-Oráculo)", () => {
  it("não chama a Router API pra pergunta de previsão", async () => {
    vi.mocked(buildForecastReport).mockResolvedValue({
      status: "INSUFFICIENT_HISTORY",
      historyMonths: 2,
      minHistoryMonths: 6,
      currency: "BRL",
      currentBalance: 100,
      horizons: [],
      alert: null,
      mape: null,
    });

    const result = await monneyhubZapHandler(message("como fica meu fluxo de caixa?"));

    expect(buildForecastReport).toHaveBeenCalledWith("tenant-1", "5511999990000");
    expect(askMarketQuestion).not.toHaveBeenCalled();
    expect(result.meta).toMatchObject({ intent: "FORECAST", modelGenerated: false });
  });

  it("avisa quando o histórico é insuficiente", async () => {
    vi.mocked(buildForecastReport).mockResolvedValue({
      status: "INSUFFICIENT_HISTORY",
      historyMonths: 2,
      minHistoryMonths: 6,
      currency: "BRL",
      currentBalance: 100,
      horizons: [],
      alert: null,
      mape: null,
    });

    const result = await monneyhubZapHandler(message("como fica meu fluxo de caixa?"));

    expect(result.replyText).toContain("Ainda não dá pra projetar");
  });

  it("mostra a faixa P10/P50/P90 pros três horizontes", async () => {
    vi.mocked(buildForecastReport).mockResolvedValue({
      status: "OK",
      historyMonths: 8,
      minHistoryMonths: 6,
      currency: "BRL",
      currentBalance: 1000,
      horizons: [
        { horizonDays: 30, p10: 800, p50: 1000, p90: 1200 },
        { horizonDays: 60, p10: 600, p50: 1000, p90: 1400 },
        { horizonDays: 90, p10: 400, p50: 1000, p90: 1600 },
      ],
      alert: null,
      mape: 4.2,
    });

    const result = await monneyhubZapHandler(message("qual a previsão do meu caixa?"));

    expect(result.replyText).toContain("30 dias");
    expect(result.replyText).toContain("60 dias");
    expect(result.replyText).toContain("90 dias");
    expect(result.replyText).not.toContain("⚠️");
  });

  it("inclui o alerta de saldo negativo quando o oráculo detecta", async () => {
    vi.mocked(buildForecastReport).mockResolvedValue({
      status: "OK",
      historyMonths: 8,
      minHistoryMonths: 6,
      currency: "BRL",
      currentBalance: 300,
      horizons: [{ horizonDays: 30, p10: -400, p50: -50, p90: 300 }],
      alert: { crossesAtDay: 21, leadDays: 21, projectedBalance: -50 },
      mape: 6.1,
    });

    const result = await monneyhubZapHandler(message("vou ficar no vermelho?"));

    expect(result.replyText).toContain("⚠️");
    expect(result.replyText).toContain("21 dias");
  });

  it("avisa quando não há conta pra prever", async () => {
    vi.mocked(buildForecastReport).mockResolvedValue({
      status: "NO_ACCOUNT",
      historyMonths: 0,
      minHistoryMonths: 6,
      currency: null,
      currentBalance: null,
      horizons: [],
      alert: null,
      mape: null,
    });

    const result = await monneyhubZapHandler(message("qual a previsão do meu caixa?"));

    expect(result.replyText).toContain("Não encontrei uma conta");
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
