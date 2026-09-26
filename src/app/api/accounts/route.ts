import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { isAuthorizedInternalRequest } from "@/lib/internal-auth";
import { prisma } from "@/lib/db";

/**
 * POST /api/accounts — vincula uma conta MonneyHub a um usuário (wa_id) de
 * um tenant já existente. Segundo passo de onboarding: sem isso, o
 * MonneyHub Zap responde "conta não encontrada" pra qualquer mensagem
 * desse número.
 *
 * body: { tenantId, userId, name, currency? } — currency default "BRL"
 * (mesmo default do schema).
 *
 * Não há FK entre Account.tenantId e Tenant.id (schemas Postgres
 * separados, mesmo padrão já usado por MemoryEntry e ForecastRun) — a
 * checagem de tenant existente é feita aqui, na camada de aplicação.
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedInternalRequest(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const body = await request.json();

  if (!body.tenantId || typeof body.tenantId !== "string") {
    return NextResponse.json({ error: "tenantId é obrigatório" }, { status: 400 });
  }
  if (!body.userId || typeof body.userId !== "string") {
    return NextResponse.json({ error: "userId é obrigatório" }, { status: 400 });
  }
  if (!body.name || typeof body.name !== "string") {
    return NextResponse.json({ error: "name é obrigatório" }, { status: 400 });
  }
  if (body.currency !== undefined && typeof body.currency !== "string") {
    return NextResponse.json({ error: "currency deve ser string" }, { status: 400 });
  }

  const tenant = await prisma.tenant.findUnique({ where: { id: body.tenantId } });
  if (!tenant) {
    return NextResponse.json({ error: `tenant ${body.tenantId} não encontrado` }, { status: 404 });
  }

  try {
    const account = await prisma.account.create({
      data: {
        tenantId: body.tenantId,
        userId: body.userId,
        name: body.name,
        ...(body.currency ? { currency: body.currency } : {}),
      },
    });
    return NextResponse.json({ account }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "esse usuário já tem conta vinculada nesse tenant" },
        { status: 409 },
      );
    }
    throw error;
  }
}
