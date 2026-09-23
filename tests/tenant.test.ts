import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: { tenant: { findUnique: vi.fn(), findMany: vi.fn() } },
}));

import { prisma } from "@/lib/db";
import { findTenantsByPhoneNumberIds } from "@/lib/tenant";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("findTenantsByPhoneNumberIds", () => {
  it("consulta uma vez só, sem repetir phone_number_id duplicado", async () => {
    vi.mocked(prisma.tenant.findMany).mockResolvedValue([
      { id: "tenant-1", whatsappPhoneNumberId: "111" },
    ] as never);

    const result = await findTenantsByPhoneNumberIds(["111", "111", "222"]);

    expect(prisma.tenant.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.tenant.findMany).toHaveBeenCalledWith({
      where: { whatsappPhoneNumberId: { in: ["111", "222"] } },
    });
    expect(result.get("111")?.id).toBe("tenant-1");
    expect(result.has("222")).toBe(false);
  });

  it("não consulta o banco quando não há mensagem", async () => {
    const result = await findTenantsByPhoneNumberIds([]);

    expect(prisma.tenant.findMany).not.toHaveBeenCalled();
    expect(result.size).toBe(0);
  });
});
