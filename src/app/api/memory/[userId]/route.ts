import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedInternalRequest } from "@/lib/internal-auth";
import { readMemory, writeMemory, deleteAllMemory, MemoryKind } from "@/lib/memory/service";

type RouteContext = { params: Promise<{ userId: string }> };

// Object.hasOwn e não `in`: `in` enxerga a cadeia de protótipo, então
// kind="constructor"/"toString" passariam pela validação e só estourariam
// lá no Prisma, virando 500 em vez de 400.
function isMemoryKind(value: unknown): value is MemoryKind {
  return typeof value === "string" && Object.hasOwn(MemoryKind, value);
}

/** GET /api/memory/:userId?tenantId=...&kind=PREFERENCE|FACT|INTERACTION */
export async function GET(request: NextRequest, { params }: RouteContext) {
  if (!isAuthorizedInternalRequest(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { userId } = await params;
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get("tenantId");
  if (!tenantId) {
    return NextResponse.json({ error: "tenantId é obrigatório" }, { status: 400 });
  }

  const kindParam = searchParams.get("kind");
  if (kindParam && !isMemoryKind(kindParam)) {
    return NextResponse.json({ error: `kind inválido: ${kindParam}` }, { status: 400 });
  }

  const entries = await readMemory(tenantId, userId, kindParam as MemoryKind | undefined);
  return NextResponse.json({ entries });
}

/** PUT /api/memory/:userId — body: { tenantId, kind, key?, value } */
export async function PUT(request: NextRequest, { params }: RouteContext) {
  if (!isAuthorizedInternalRequest(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { userId } = await params;
  const body = await request.json();

  if (!body.tenantId || typeof body.tenantId !== "string") {
    return NextResponse.json({ error: "tenantId é obrigatório" }, { status: 400 });
  }
  if (!isMemoryKind(body.kind)) {
    return NextResponse.json({ error: `kind inválido: ${body.kind}` }, { status: 400 });
  }
  if (body.value === undefined) {
    return NextResponse.json({ error: "value é obrigatório" }, { status: 400 });
  }

  const entry = await writeMemory({
    tenantId: body.tenantId,
    userId,
    kind: body.kind,
    key: body.key,
    value: body.value,
  });

  return NextResponse.json({ entry });
}

/** DELETE /api/memory/:userId?tenantId=... — exclusão total (LGPD). */
export async function DELETE(request: NextRequest, { params }: RouteContext) {
  if (!isAuthorizedInternalRequest(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { userId } = await params;
  const { searchParams } = new URL(request.url);
  const tenantId = searchParams.get("tenantId");
  if (!tenantId) {
    return NextResponse.json({ error: "tenantId é obrigatório" }, { status: 400 });
  }

  const result = await deleteAllMemory(tenantId, userId);
  return NextResponse.json(result);
}
