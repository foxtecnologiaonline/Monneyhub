import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/monneyhub/balance", () => ({
  getCurrentBalance: vi.fn(),
  getRecentTransactions: vi.fn(),
}));
vi.mock("@/lib/monneyhub/forecast/read", () => ({ getLatestForecast: vi.fn() }));
vi.mock("@/lib/monneyhub/zap/perplexity", () => ({ askMarketQuestion: vi.fn() }));
vi.mock("@/lib/monneyhub/zap/content-safety", () => ({ analyzeOutboundText: vi.fn() }));

import { getCurrentBalance, getRecentTransactions } from "@/lib/monneyhub/balance";
import { getLatestForecast } from "@/lib/monneyhub/forecast/read";
import { askMarketQuestion } from "@/lib/monneyhub/zap/perplexity";
import { analyzeOutboundText } from "@/lib/monneyhub/zap/content-safety";
import { monneyhubZapHandler } from "@/lib/handlers/monneyhub-zap";
import { INVESTMENT_DISCLAIMER } from "@/lib/monneyhub/zap/rules";
import type { NormalizedMessage } from "@/lib/handlers/types";

function message(text: string): NormalizedMessage {
  return {
    tenantId: "t1",
    phoneNumberId: "111",
    userId: "5511999990000",
    messageId: "wamid.1",
    text,
    timestamp: new Date().toISOString(),
    raw: {},
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(analyzeOutboundText).mockResolvedValue({ safe: true, flagged: [] });
});

describe("monneyhubZapHandler", () => {
  it("responde saldo com dado interno, sem chamar a API externa", async () => {
    vi.mocked(getCurrentBalance).mockResolvedValue(1234.5);

    const result = await monneyhubZapHandler(message("qual meu saldo?"));

    expect(result.replyText).toContain("1.234,50");
    expect(askMarketQuestion).not.toHaveBeenCalled();
    expect(result.meta).toMatchObject({ intent: "BALANCE" });
  });

  it("responde extrato com os últimos lançamentos", async () => {
    vi.mocked(getRecentTransactions).mockResolvedValue([
      {
        occurredOn: new Date("2026-03-10T00:00:00Z"),
        amount: { toNumber: () => 50 },
        type: "EXPENSE",
        description: "mercado",
      },
    ] as never);

    const result = await monneyhubZapHandler(message("me manda o extrato"));

    expect(result.replyText).toContain("mercado");
    expect(result.replyText).toContain("50,00");
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

  it("devolve a previsão como faixa, não número único", async () => {
    vi.mocked(getLatestForecast).mockResolvedValue({
      status: "READY",
      horizons: [{ horizonDays: 30, pessimista: 100, realista: 500, otimista: 900 }],
      negativeBalanceAlert: null,
    });

    const result = await monneyhubZapHandler(message("qual a previsão do meu fluxo de caixa?"));

    expect(result.replyText).toContain("500,00");
    expect(result.replyText).toContain("100,00");
    expect(result.replyText).toContain("900,00");
  });

  it("consulta a Router API em pergunta de mercado e injeta o disclaimer", async () => {
    vi.mocked(askMarketQuestion).mockResolvedValue("O CDI está em 10,5% ao ano.");

    const result = await monneyhubZapHandler(message("quanto está o CDI?"));

    expect(askMarketQuestion).toHaveBeenCalledWith("quanto está o CDI?");
    expect(result.replyText).toContain(INVESTMENT_DISCLAIMER);
  });

  it("responde com fallback quando a Router API falha, sem derrubar o job", async () => {
    vi.mocked(askMarketQuestion).mockRejectedValue(new Error("timeout"));

    const result = await monneyhubZapHandler(message("como está o mercado hoje?"));

    expect(result.replyText).toContain("Não consegui consultar");
  });

  it("bloqueia a resposta quando o Content Safety reprova", async () => {
    vi.mocked(getCurrentBalance).mockResolvedValue(10);
    vi.mocked(analyzeOutboundText).mockResolvedValue({
      safe: false,
      flagged: [{ category: "Hate", severity: 6 }],
    });

    const result = await monneyhubZapHandler(message("qual meu saldo?"));

    expect(result.replyText).not.toContain("10,00");
    expect(result.meta).toMatchObject({ blocked: true });
  });

  it("passa pelo Content Safety toda resposta antes de enviar", async () => {
    vi.mocked(getCurrentBalance).mockResolvedValue(10);

    await monneyhubZapHandler(message("qual meu saldo?"));

    expect(analyzeOutboundText).toHaveBeenCalledTimes(1);
  });
});
