import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  prisma: {
    memoryEntry: {
      findMany: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/db";
import { readMemory, writeMemory, deleteAllMemory, MemoryKind } from "@/lib/memory/service";

const tenantId = "tenant-1";
const userId = "user-1";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("readMemory", () => {
  it("filtra por tenantId, userId e kind quando informado", async () => {
    vi.mocked(prisma.memoryEntry.findMany).mockResolvedValue([]);

    await readMemory(tenantId, userId, MemoryKind.PREFERENCE);

    expect(prisma.memoryEntry.findMany).toHaveBeenCalledWith({
      where: { tenantId, userId, kind: MemoryKind.PREFERENCE },
      orderBy: { updatedAt: "desc" },
    });
  });
});

describe("writeMemory", () => {
  it("faz upsert por chave pra PREFERENCE", async () => {
    vi.mocked(prisma.memoryEntry.upsert).mockResolvedValue({} as never);

    await writeMemory({ tenantId, userId, kind: MemoryKind.PREFERENCE, key: "tom", value: "formal" });

    expect(prisma.memoryEntry.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId_userId_kind_key: { tenantId, userId, kind: MemoryKind.PREFERENCE, key: "tom" },
        },
      }),
    );
  });

  it("exige key pra FACT", async () => {
    await expect(
      writeMemory({ tenantId, userId, kind: MemoryKind.FACT, value: "algo" }),
    ).rejects.toThrow(/key é obrigatória/);
  });

  it("sempre cria um novo registro pra INTERACTION, mesmo sem key", async () => {
    vi.mocked(prisma.memoryEntry.create).mockResolvedValue({} as never);

    await writeMemory({ tenantId, userId, kind: MemoryKind.INTERACTION, value: { text: "oi" } });

    expect(prisma.memoryEntry.create).toHaveBeenCalledTimes(1);
    expect(prisma.memoryEntry.upsert).not.toHaveBeenCalled();
  });
});

describe("deleteAllMemory", () => {
  it("apaga tudo do usuário no tenant e devolve a contagem", async () => {
    vi.mocked(prisma.memoryEntry.deleteMany).mockResolvedValue({ count: 3 });

    const result = await deleteAllMemory(tenantId, userId);

    expect(prisma.memoryEntry.deleteMany).toHaveBeenCalledWith({ where: { tenantId, userId } });
    expect(result).toEqual({ deleted: 3 });
  });
});
