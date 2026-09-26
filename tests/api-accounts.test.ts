import { describe, expect, it, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({
  prisma: { tenant: { findUnique: vi.fn() }, account: { create: vi.fn() } },
}));

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { POST } from "@/app/api/accounts/route";

function request(body: unknown, key = "chave-interna-secreta"): NextRequest {
  return {
    headers: { get: (name: string) => (name === "x-internal-api-key" ? key : null) },
    json: async () => body,
  } as unknown as NextRequest;
}

const validBody = { tenantId: "tenant-1", userId: "5511999990000", name: "Conta principal" };

beforeEach(() => {
  vi.clearAllMocks();
  process.env.INTERNAL_API_KEY = "chave-interna-secreta";
});

describe("POST /api/accounts", () => {
  it("rejeita sem autenticação", async () => {
    const response = await POST(request(validBody, "errada"));
    expect(response.status).toBe(401);
    expect(prisma.tenant.findUnique).not.toHaveBeenCalled();
  });

  it("rejeita sem tenantId/userId/name", async () => {
    expect((await POST(request({ userId: "u", name: "n" }))).status).toBe(400);
    expect((await POST(request({ tenantId: "t", name: "n" }))).status).toBe(400);
    expect((await POST(request({ tenantId: "t", userId: "u" }))).status).toBe(400);
  });

  it("rejeita currency que não é string", async () => {
    const response = await POST(request({ ...validBody, currency: 123 }));
    expect(response.status).toBe(400);
  });

  it("devolve 404 quando o tenant não existe", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue(null);

    const response = await POST(request(validBody));

    expect(response.status).toBe(404);
    expect(prisma.account.create).not.toHaveBeenCalled();
  });

  it("cria a conta com currency default BRL quando não informado", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue({ id: "tenant-1" } as never);
    vi.mocked(prisma.account.create).mockResolvedValue({ id: "account-1", ...validBody } as never);

    const response = await POST(request(validBody));

    expect(response.status).toBe(201);
    expect(prisma.account.create).toHaveBeenCalledWith({
      data: { tenantId: "tenant-1", userId: "5511999990000", name: "Conta principal" },
    });
  });

  it("repassa currency quando informado", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue({ id: "tenant-1" } as never);
    vi.mocked(prisma.account.create).mockResolvedValue({ id: "account-1" } as never);

    await POST(request({ ...validBody, currency: "USD" }));

    expect(prisma.account.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ currency: "USD" }),
    });
  });

  it("devolve 409 quando a conta já existe pra esse usuário nesse tenant", async () => {
    vi.mocked(prisma.tenant.findUnique).mockResolvedValue({ id: "tenant-1" } as never);
    vi.mocked(prisma.account.create).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "5.22.0",
      }),
    );

    const response = await POST(request(validBody));
    expect(response.status).toBe(409);
  });
});
