import { describe, expect, it, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";
import { isAuthorizedInternalRequest } from "@/lib/internal-auth";

function requestWithKey(key: string | null): NextRequest {
  return {
    headers: { get: (name: string) => (name === "x-internal-api-key" ? key : null) },
  } as unknown as NextRequest;
}

describe("isAuthorizedInternalRequest", () => {
  beforeEach(() => {
    process.env.INTERNAL_API_KEY = "chave-interna-secreta";
  });
  afterEach(() => {
    delete process.env.INTERNAL_API_KEY;
  });

  it("aceita a chave correta", () => {
    expect(isAuthorizedInternalRequest(requestWithKey("chave-interna-secreta"))).toBe(true);
  });

  it("rejeita chave errada de mesmo tamanho", () => {
    expect(isAuthorizedInternalRequest(requestWithKey("chave-interna-secretX"))).toBe(false);
  });

  it("rejeita chave de tamanho diferente sem estourar", () => {
    expect(isAuthorizedInternalRequest(requestWithKey("curta"))).toBe(false);
  });

  it("rejeita requisição sem header", () => {
    expect(isAuthorizedInternalRequest(requestWithKey(null))).toBe(false);
  });

  it("falha explicitamente quando INTERNAL_API_KEY não está configurada", () => {
    delete process.env.INTERNAL_API_KEY;
    expect(() => isAuthorizedInternalRequest(requestWithKey("qualquer"))).toThrow(
      /INTERNAL_API_KEY/,
    );
  });
});
