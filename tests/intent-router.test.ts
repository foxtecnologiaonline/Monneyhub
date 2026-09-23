import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/intent/classify", () => ({
  classifyIntent: vi.fn(),
}));

// O handler do MonneyHub Zap deixou de ser stub na Fase 1: sem isolar as
// dependências externas dele, este teste de roteamento passaria a bater em
// Postgres de verdade.
vi.mock("@/lib/finance/queries", () => ({
  getAccountSummary: vi.fn().mockResolvedValue(null),
  getRecentTransactions: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/perplexity/router", () => ({
  askMarketQuestion: vi.fn(),
  isRouterConfigured: vi.fn(() => false),
}));

vi.mock("@/lib/safety/content-safety", () => ({
  analyzeOutboundText: vi
    .fn()
    .mockResolvedValue({ allowed: true, status: "analyzed", maxSeverity: 0 }),
}));

import { classifyIntent } from "@/lib/intent/classify";
import { routeMessage } from "@/lib/intent/router";
import type { NormalizedMessage } from "@/lib/handlers/types";

const baseMessage: NormalizedMessage = {
  tenantId: "tenant-1",
  userId: "5511999990000",
  text: "qual meu saldo?",
  timestamp: new Date().toISOString(),
  raw: {},
};

describe("routeMessage", () => {
  it("despacha pro handler do produto classificado", async () => {
    vi.mocked(classifyIntent).mockResolvedValue("monneyhub-zap");

    const result = await routeMessage(baseMessage);

    expect(result.product).toBe("monneyhub-zap");
    expect(result.response.meta).toMatchObject({ product: "monneyhub-zap" });
    expect(result.response.replyText).toBeTruthy();
  });

  it("despacha pra cada um dos quatro produtos suportados", async () => {
    const products = ["sales-agent", "monneyhub-zap", "normas-ia", "personai"] as const;

    for (const product of products) {
      vi.mocked(classifyIntent).mockResolvedValue(product);
      const result = await routeMessage(baseMessage);
      expect(result.product).toBe(product);
    }
  });
});
