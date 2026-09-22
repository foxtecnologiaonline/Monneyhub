import { createHmac } from "node:crypto";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { verifyWebhookChallenge, isValidWhatsAppSignature } from "@/lib/whatsapp/verify";

describe("verifyWebhookChallenge", () => {
  beforeEach(() => {
    process.env.META_WEBHOOK_VERIFY_TOKEN = "token-secreto";
  });
  afterEach(() => {
    delete process.env.META_WEBHOOK_VERIFY_TOKEN;
  });

  it("devolve o challenge quando mode e token batem", () => {
    const result = verifyWebhookChallenge({
      mode: "subscribe",
      token: "token-secreto",
      challenge: "abc123",
    });
    expect(result).toBe("abc123");
  });

  it("retorna null quando o token não bate", () => {
    const result = verifyWebhookChallenge({
      mode: "subscribe",
      token: "token-errado",
      challenge: "abc123",
    });
    expect(result).toBeNull();
  });

  it("retorna null quando mode não é subscribe", () => {
    const result = verifyWebhookChallenge({
      mode: "unsubscribe",
      token: "token-secreto",
      challenge: "abc123",
    });
    expect(result).toBeNull();
  });
});

describe("isValidWhatsAppSignature", () => {
  const appSecret = "app-secret-de-teste";

  beforeEach(() => {
    process.env.META_APP_SECRET = appSecret;
  });
  afterEach(() => {
    delete process.env.META_APP_SECRET;
  });

  it("aceita uma assinatura válida", () => {
    const rawBody = JSON.stringify({ hello: "world" });
    const signature = "sha256=" + createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");

    expect(isValidWhatsAppSignature(rawBody, signature)).toBe(true);
  });

  it("rejeita uma assinatura inválida", () => {
    const rawBody = JSON.stringify({ hello: "world" });
    expect(isValidWhatsAppSignature(rawBody, "sha256=" + "0".repeat(64))).toBe(false);
  });

  it("rejeita quando não há header de assinatura", () => {
    expect(isValidWhatsAppSignature("{}", null)).toBe(false);
  });

  it("rejeita corpo alterado mesmo com assinatura de outro corpo", () => {
    const signature =
      "sha256=" + createHmac("sha256", appSecret).update("{}", "utf8").digest("hex");
    expect(isValidWhatsAppSignature('{"tampered":true}', signature)).toBe(false);
  });
});
