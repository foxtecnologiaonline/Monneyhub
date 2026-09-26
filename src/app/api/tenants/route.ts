import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { isAuthorizedInternalRequest } from "@/lib/internal-auth";
import { prisma } from "@/lib/db";

/**
 * POST /api/tenants — cria um tenant (empresa cliente FOX). É o primeiro
 * passo de onboarding: sem tenant não há `whatsappPhoneNumberId` pro
 * Gateway resolver, e nenhuma mensagem chega a produto nenhum.
 *
 * body: { name, whatsappPhoneNumberId }
 */
export async function POST(request: NextRequest) {
  if (!isAuthorizedInternalRequest(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const body = await request.json();

  if (!body.name || typeof body.name !== "string") {
    return NextResponse.json({ error: "name é obrigatório" }, { status: 400 });
  }
  if (!body.whatsappPhoneNumberId || typeof body.whatsappPhoneNumberId !== "string") {
    return NextResponse.json({ error: "whatsappPhoneNumberId é obrigatório" }, { status: 400 });
  }

  try {
    const tenant = await prisma.tenant.create({
      data: { name: body.name, whatsappPhoneNumberId: body.whatsappPhoneNumberId },
    });
    return NextResponse.json({ tenant }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json(
        { error: "já existe um tenant com esse whatsappPhoneNumberId" },
        { status: 409 },
      );
    }
    throw error;
  }
}
