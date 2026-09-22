import { describe, expect, it } from "vitest";
import { normalizeWhatsAppPayload } from "@/lib/whatsapp/normalize";

function buildPayload(messages: unknown[]) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "entry-1",
        changes: [
          {
            field: "messages",
            value: {
              metadata: { phone_number_id: "1234567890" },
              messages,
            },
          },
        ],
      },
    ],
  };
}

describe("normalizeWhatsAppPayload", () => {
  it("extrai mensagens de texto com phoneNumberId, waId, texto e timestamp ISO", () => {
    const payload = buildPayload([
      { from: "5511999990000", id: "wamid.1", timestamp: "1700000000", type: "text", text: { body: "oi" } },
    ]);

    const result = normalizeWhatsAppPayload(payload);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      phoneNumberId: "1234567890",
      waId: "5511999990000",
      text: "oi",
    });
    expect(result[0]!.timestamp).toBe(new Date(1700000000 * 1000).toISOString());
  });

  it("ignora mensagens que não são de texto", () => {
    const payload = buildPayload([
      { from: "5511999990000", id: "wamid.1", timestamp: "1700000000", type: "image" },
      { from: "5511999990000", id: "wamid.2", timestamp: "1700000001", type: "text", text: { body: "oi" } },
    ]);

    expect(normalizeWhatsAppPayload(payload)).toHaveLength(1);
  });

  it("retorna lista vazia quando não há entry/changes", () => {
    expect(normalizeWhatsAppPayload({})).toEqual([]);
  });

  it("lida com múltiplas mensagens no mesmo payload", () => {
    const payload = buildPayload([
      { from: "5511999990000", id: "wamid.1", timestamp: "1700000000", type: "text", text: { body: "um" } },
      { from: "5511999990001", id: "wamid.2", timestamp: "1700000001", type: "text", text: { body: "dois" } },
    ]);

    expect(normalizeWhatsAppPayload(payload)).toHaveLength(2);
  });
});
