import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { analyzeOutboundText } from "@/lib/safety/content-safety";

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function unconfigure(nodeEnv: string) {
  vi.stubEnv("AZURE_CONTENT_SAFETY_ENDPOINT", "");
  vi.stubEnv("AZURE_CONTENT_SAFETY_KEY", "");
  vi.stubEnv("NODE_ENV", nodeEnv);
}

function configure() {
  vi.stubEnv("AZURE_CONTENT_SAFETY_ENDPOINT", "https://exemplo.cognitiveservices.azure.com");
  vi.stubEnv("AZURE_CONTENT_SAFETY_KEY", "chave-de-teste");
}

function mockAnalyzeResponse(severities: number[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        categoriesAnalysis: severities.map((severity, index) => ({
          category: `cat-${index}`,
          severity,
        })),
      }),
    }),
  );
}

describe("analyzeOutboundText — sem credencial", () => {
  it("passa fora de produção e sinaliza que pulou", async () => {
    unconfigure("development");

    const verdict = await analyzeOutboundText("oi", { timeoutMs: 100, failClosed: true });

    expect(verdict).toMatchObject({ allowed: true, status: "skipped" });
  });

  it("bloqueia em produção — rodar sem a guarda é o cenário proibido", async () => {
    unconfigure("production");
    vi.spyOn(console, "error").mockImplementation(() => {});

    const verdict = await analyzeOutboundText("oi", { timeoutMs: 100, failClosed: false });

    expect(verdict.allowed).toBe(false);
  });
});

describe("analyzeOutboundText — com credencial", () => {
  it("permite conteúdo abaixo do limiar", async () => {
    configure();
    mockAnalyzeResponse([0, 2]);

    const verdict = await analyzeOutboundText("saldo", { timeoutMs: 100, failClosed: true });

    expect(verdict).toMatchObject({ allowed: true, status: "analyzed", maxSeverity: 2 });
  });

  it("bloqueia conteúdo no limiar ou acima", async () => {
    configure();
    mockAnalyzeResponse([0, 4]);

    const verdict = await analyzeOutboundText("ruim", { timeoutMs: 100, failClosed: true });

    expect(verdict.allowed).toBe(false);
  });

  it("respeita o limiar configurado por env", async () => {
    configure();
    vi.stubEnv("AZURE_CONTENT_SAFETY_BLOCK_SEVERITY", "2");
    mockAnalyzeResponse([2]);

    const verdict = await analyzeOutboundText("ruim", { timeoutMs: 100, failClosed: true });

    expect(verdict.allowed).toBe(false);
  });

  it("indisponível: bloqueia texto de modelo e libera texto interno", async () => {
    configure();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));

    const gerado = await analyzeOutboundText("x", { timeoutMs: 100, failClosed: true });
    const interno = await analyzeOutboundText("x", { timeoutMs: 100, failClosed: false });

    expect(gerado).toMatchObject({ allowed: false, status: "unavailable" });
    expect(interno).toMatchObject({ allowed: true, status: "unavailable" });
  });
});
