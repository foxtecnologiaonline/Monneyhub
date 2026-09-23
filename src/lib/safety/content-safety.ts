const API_VERSION = "2024-09-01";
const DEFAULT_BLOCK_SEVERITY = 4;

export type SafetyStatus = "analyzed" | "skipped" | "unavailable";

export interface SafetyVerdict {
  allowed: boolean;
  status: SafetyStatus;
  maxSeverity: number | null;
}

interface AnalyzeTextResponse {
  categoriesAnalysis?: Array<{ category: string; severity: number }>;
}

function isConfigured(): boolean {
  return Boolean(process.env.AZURE_CONTENT_SAFETY_ENDPOINT && process.env.AZURE_CONTENT_SAFETY_KEY);
}

function blockSeverity(): number {
  const raw = process.env.AZURE_CONTENT_SAFETY_BLOCK_SEVERITY;
  const parsed = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : DEFAULT_BLOCK_SEVERITY;
}

/**
 * Guarda de conteúdo (Azure AI Content Safety) antes de qualquer resposta
 * financeira sair. `failClosed` decide o que fazer quando o serviço não
 * responde: texto gerado por modelo é bloqueado (não dá pra afirmar que é
 * seguro), texto que nós mesmos montamos a partir do banco passa — é
 * template nosso, não saída de LLM.
 *
 * Sem credencial configurada: passa em dev, bloqueia em produção. Rodar
 * produção sem a guarda é justamente o cenário que o critério de aceite
 * proíbe.
 */
export async function analyzeOutboundText(
  text: string,
  options: { timeoutMs: number; failClosed: boolean },
): Promise<SafetyVerdict> {
  if (!isConfigured()) {
    const allowed = process.env.NODE_ENV !== "production";
    if (!allowed) {
      console.error("[content-safety] sem credencial em produção — resposta bloqueada.");
    }
    return { allowed, status: "skipped", maxSeverity: null };
  }

  const endpoint = process.env.AZURE_CONTENT_SAFETY_ENDPOINT!.replace(/\/+$/, "");

  try {
    const response = await fetch(
      `${endpoint}/contentsafety/text:analyze?api-version=${API_VERSION}`,
      {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": process.env.AZURE_CONTENT_SAFETY_KEY!,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text, outputType: "FourSeverityLevels" }),
        signal: AbortSignal.timeout(options.timeoutMs),
      },
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = (await response.json()) as AnalyzeTextResponse;
    const severities = (data.categoriesAnalysis ?? []).map((item) => item.severity);
    const maxSeverity = severities.length > 0 ? Math.max(...severities) : 0;

    return { allowed: maxSeverity < blockSeverity(), status: "analyzed", maxSeverity };
  } catch (error) {
    console.error("[content-safety] análise indisponível:", error);
    return { allowed: !options.failClosed, status: "unavailable", maxSeverity: null };
  }
}
