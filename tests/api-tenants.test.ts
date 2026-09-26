import { describe, expect, it, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
  prisma: { tenant: { create: vi.fn() } },
}));

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { POST } from "@/app/api/tenants/route";

function request(body: unknown, key = "chave-interna-secreta"): NextRequest {
  return {
    headers: { get: (name: string) => (name === "x-internal-api-key" ? key : null) },
    json: async () => body,
  } as unknown as NextRequest;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.INTERNAL_API_KEY = "chave-interna-secreta";
});

describe("POST /api/tenants", () => {
  it("rejeita sem autenticação", async () => {
    const response = await POST(request({}, "errada"));
    expect(response.status).toBe(401);
  });

  it("rejeita sem name", async () => {
    const response = await POST(request({ whatsappPhoneNumberId: "123" }));
    expect(response.status).toBe(400);
  });

  it("rejeita sem whatsappPhoneNumberId", async () => {
    const response = await POST(request({ name: "Padaria do João" }));
    expect(response.status).toBe(400);
  });

  it("cria o tenant e devolve 201", async () => {
    vi.mocked(prisma.tenant.create).mockResolvedValue({
      id: "tenant-1",
      name: "Padaria do João",
      whatsappPhoneNumberId: "123",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const response = await POST(request({ name: "Padaria do João", whatsappPhoneNumberId: "123" }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.tenant.id).toBe("tenant-1");
    expect(prisma.tenant.create).toHaveBeenCalledWith({
      data: { name: "Padaria do João", whatsappPhoneNumberId: "123" },
    });
  });

  it("devolve 409 quando whatsappPhoneNumberId já existe", async () => {
    vi.mocked(prisma.tenant.create).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "5.22.0",
      }),
    );

    const response = await POST(request({ name: "Dup", whatsappPhoneNumberId: "123" }));
    expect(response.status).toBe(409);
  });
});
