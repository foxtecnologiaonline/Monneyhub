import { NextRequest, NextResponse } from "next/server";
import { isAuthorizedInternalRequest } from "@/lib/internal-auth";
import { buildForecastReport } from "@/lib/mei-oraculo/service";

type RouteContext = { params: Promise<{ userId: string }> };

/**
 * GET /api/forecast/:userId?tenantId=...
 * Previsão de saldo em faixa pros próximos 30/60/90 dias (MEI-Oráculo).
 * API interna, mesma chave compartilhada do resto dos serviços FOX.
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

  const report = await buildForecastReport(tenantId, userId);

  if (report.status === "NO_ACCOUNT") {
    return NextResponse.json({ error: "conta não encontrada" }, { status: 404 });
  }

  return NextResponse.json(report);
}
