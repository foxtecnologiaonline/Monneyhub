import { describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();

vi.mock("@/lib/redis", () => ({
  getRedisConnection: () => ({
    set: vi.fn(async (key: string, value: string, ..._rest: unknown[]) => {
      if (store.has(key)) return null;
      store.set(key, value);
      return "OK";
    }),
  }),
}));

import { claimWhatsAppMessage } from "@/lib/whatsapp/dedupe";

describe("claimWhatsAppMessage", () => {
  it("aceita a primeira vez que vê um wamid", async () => {
    expect(await claimWhatsAppMessage("wamid.unico-1")).toBe(true);
  });

  it("rejeita reentrega do mesmo wamid", async () => {
    await claimWhatsAppMessage("wamid.unico-2");

    expect(await claimWhatsAppMessage("wamid.unico-2")).toBe(false);
  });

  it("trata wamid diferente como mensagem nova", async () => {
    await claimWhatsAppMessage("wamid.unico-3");

    expect(await claimWhatsAppMessage("wamid.unico-4")).toBe(true);
  });
});
