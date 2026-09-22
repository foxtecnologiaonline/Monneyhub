import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { MemoryKind, type MemoryEntry, type Prisma } from "@prisma/client";

export { MemoryKind };

export interface MemoryWriteInput {
  tenantId: string;
  userId: string;
  kind: MemoryKind;
  /** Obrigatória pra PREFERENCE/FACT (upsert); gerada automaticamente pra INTERACTION. */
  key?: string;
  value: Prisma.InputJsonValue;
}

/** Lê toda a memória de um usuário, opcionalmente filtrada por tipo. */
export async function readMemory(
  tenantId: string,
  userId: string,
  kind?: MemoryKind,
): Promise<MemoryEntry[]> {
  return prisma.memoryEntry.findMany({
    where: { tenantId, userId, ...(kind ? { kind } : {}) },
    orderBy: { updatedAt: "desc" },
  });
}

/**
 * PREFERENCE e FACT são upsert por chave (um valor vigente por chave).
 * INTERACTION é sempre um novo registro — histórico, não estado.
 */
export async function writeMemory(input: MemoryWriteInput): Promise<MemoryEntry> {
  if (input.kind === MemoryKind.INTERACTION) {
    return prisma.memoryEntry.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        kind: input.kind,
        key: input.key ?? randomUUID(),
        value: input.value,
      },
    });
  }

  if (!input.key) {
    throw new Error(`key é obrigatória pra memória do tipo ${input.kind}.`);
  }

  return prisma.memoryEntry.upsert({
    where: {
      tenantId_userId_kind_key: {
        tenantId: input.tenantId,
        userId: input.userId,
        kind: input.kind,
        key: input.key,
      },
    },
    create: {
      tenantId: input.tenantId,
      userId: input.userId,
      kind: input.kind,
      key: input.key,
      value: input.value,
    },
    update: { value: input.value },
  });
}

/**
 * Exclusão total e imediata da memória de um usuário — direito ao
 * esquecimento (LGPD). Roda em até 24h por ser síncrona: não existe
 * fila/job de exclusão adiada, ela já acontece na chamada.
 */
export async function deleteAllMemory(tenantId: string, userId: string): Promise<{ deleted: number }> {
  const result = await prisma.memoryEntry.deleteMany({ where: { tenantId, userId } });
  return { deleted: result.count };
}
