import type { NextRequest } from "next/server";

/**
 * API interna (não é pública): protegida por chave compartilhada entre
 * serviços internos FOX TecnologIA, não por login de usuário final.
 */
export function isAuthorizedInternalRequest(request: NextRequest): boolean {
  const expected = process.env.INTERNAL_API_KEY;
  if (!expected) {
    throw new Error("INTERNAL_API_KEY não configurada.");
  }
  return request.headers.get("x-internal-api-key") === expected;
}
