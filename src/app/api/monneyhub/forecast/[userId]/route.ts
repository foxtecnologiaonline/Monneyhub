import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedInternalRequest } from "@/lib/internal-auth";
import { getLatestForecast } from "@/lib/monneyhub/forecast/read";

type RouteContext = { params: Promise<{ userId: string }> };

/**
 * GET /api/monneyhub/forecast/:userId?tenantId=...
 * Previsão de saldo em faixa (pessimista/realista/otimista) pros próximos
 * 30/60/90 dias. Faixa e não número único — evita falsa precisão.
 */
export async function GET(request: NextRequest, { params }: RouteContext) {
  if (!isAuthorizedInternalRequest(request)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { userId } = await params;
  const tenantId = new URL(request.url).searchParams.get("tenantId");
  if (!tenantId) {
    return NextResponse.json({ error: "tenantId é obrigatório" }, { status: 400 });
  }

  return NextResponse.json(await getLatestForecast(tenantId, userId));
}
