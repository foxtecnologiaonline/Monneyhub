import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/intent/classify", () => ({ classifyIntent: vi.fn() }));

// O roteador é testado pelo que ele faz — despachar pro handler certo —,
// não pela lógica interna de cada produto (essa tem teste próprio).
const calls: string[] = [];
vi.mock("@/lib/handlers/index", () => ({
  productHandlers: {
    "sales-agent": vi.fn(async () => stub("sales-agent")),
    "monneyhub-zap": vi.fn(async () => stub("monneyhub-zap")),
    "normas-ia": vi.fn(async () => stub("normas-ia")),
    personai: vi.fn(async () => stub("personai")),
  },
}));

function stub(product: string) {
  calls.push(product);
  return { replyText: `resposta de ${product}`, meta: { product } };
}

import { classifyIntent } from "@/lib/intent/classify";
import { routeMessage } from "@/lib/intent/router";
import type { NormalizedMessage } from "@/lib/handlers/types";

const baseMessage: NormalizedMessage = {
  tenantId: "tenant-1",
  phoneNumberId: "1234567890",
  userId: "5511999990000",
  messageId: "wamid.teste",
  text: "qual meu saldo?",
  timestamp: new Date().toISOString(),
  raw: {},
};

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
});

describe("routeMessage", () => {
  it("despacha pro handler do produto classificado", async () => {
    vi.mocked(classifyIntent).mockResolvedValue("monneyhub-zap");

    const result = await routeMessage(baseMessage);

    expect(result.product).toBe("monneyhub-zap");
    expect(calls).toEqual(["monneyhub-zap"]);
    expect(result.response.replyText).toBeTruthy();
  });

  it("despacha pra cada um dos quatro produtos suportados", async () => {
    const products = ["sales-agent", "monneyhub-zap", "normas-ia", "personai"] as const;

    for (const product of products) {
      vi.mocked(classifyIntent).mockResolvedValue(product);
      const result = await routeMessage(baseMessage);
      expect(result.product).toBe(product);
    }

    expect(calls).toEqual([...products]);
  });

  it("repassa a mensagem normalizada intacta pro handler", async () => {
    vi.mocked(classifyIntent).mockResolvedValue("personai");
    const { productHandlers } = await import("@/lib/handlers/index");

    await routeMessage(baseMessage);

    expect(productHandlers.personai).toHaveBeenCalledWith(baseMessage);
  });
});
