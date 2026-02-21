/**
 * Uses Gemini Vision to describe images, charts, and tables in a PDF.
 * Call this for PDFs to get richer context for RAG.
 */

const VISION_MODEL = "gemini-2.5-flash";
const MAX_PDF_BYTES = 4 * 1024 * 1024; // 4 MB to avoid timeout

function getApiKey(): string {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set");
  return key;
}

export async function describePdfWithVision(buffer: Buffer): Promise<string> {
  if (buffer.length > MAX_PDF_BYTES) {
    return "";
  }
  const apiKey = getApiKey();
  const base64 = buffer.toString("base64");
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${VISION_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                inline_data: {
                  mime_type: "application/pdf",
                  data: base64,
                },
              },
              {
                text: "Describe any images, charts, figures, or tables in this document. Be concise. If there are none, say 'No images or tables detected.'",
              },
            ],
          },
        ],
        generationConfig: { maxOutputTokens: 1024 },
      }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    console.warn("[Nexus AI] Gemini Vision failed:", res.status, err);
    return "";
  }
  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };
  const text =
    data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
  return text;
}
