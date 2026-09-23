import ContentSafetyClient, { isUnexpected } from "@azure-rest/ai-content-safety";
import { AzureKeyCredential } from "@azure/core-auth";

/**
 * Guarda de conteúdo antes de qualquer resposta financeira sair. Azure AI
 * Content Safety devolve severidade 0-6 por categoria; bloqueamos a partir
 * do limiar configurado.
 */

type Client = ReturnType<typeof ContentSafetyClient>;

let client: Client | undefined;

function getClient(): Client {
  if (!client) {
    const endpoint = process.env.AZURE_CONTENT_SAFETY_ENDPOINT;
    const key = process.env.AZURE_CONTENT_SAFETY_KEY;
    if (!endpoint || !key) {
      throw new Error("AZURE_CONTENT_SAFETY_ENDPOINT/KEY não configurados.");
    }
    client = ContentSafetyClient(endpoint, new AzureKeyCredential(key));
  }
  return client;
}

function severityThreshold(): number {
  return Number(process.env.AZURE_CONTENT_SAFETY_THRESHOLD ?? 4);
}

export interface SafetyVerdict {
  safe: boolean;
  /** Categorias que bateram ou passaram do limiar. */
  flagged: Array<{ category: string; severity: number }>;
}

/**
 * Sem credencial configurada o texto passa — content safety não pode ser o
 * que derruba o produto em dev. Em produção a env é obrigatória (ver README).
 */
export async function analyzeOutboundText(text: string): Promise<SafetyVerdict> {
  if (!process.env.AZURE_CONTENT_SAFETY_ENDPOINT || !process.env.AZURE_CONTENT_SAFETY_KEY) {
    return { safe: true, flagged: [] };
  }

  const result = await getClient().path("/text:analyze").post({ body: { text } });
  if (isUnexpected(result)) {
    throw new Error(`Content Safety falhou: ${result.status} ${JSON.stringify(result.body)}`);
  }

  const threshold = severityThreshold();
  const flagged = (result.body.categoriesAnalysis ?? [])
    .filter((analysis) => (analysis.severity ?? 0) >= threshold)
    .map((analysis) => ({ category: analysis.category, severity: analysis.severity ?? 0 }));

  return { safe: flagged.length === 0, flagged };
}
