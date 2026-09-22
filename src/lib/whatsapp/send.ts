const GRAPH_API_VERSION = "v21.0";

/** Envia uma mensagem de texto de volta via Meta Graph API (Cloud API). */
export async function sendWhatsAppTextMessage(params: {
  phoneNumberId: string;
  to: string;
  text: string;
}): Promise<void> {
  const accessToken = process.env.META_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("META_ACCESS_TOKEN não configurada — não dá pra enviar resposta.");
  }

  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${params.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: params.to,
        type: "text",
        text: { body: params.text },
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Falha ao enviar mensagem WhatsApp (${response.status}): ${body}`);
  }
}
