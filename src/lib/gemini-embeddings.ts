/**
 * Gemini text-embedding-004 via REST API.
 * Output is 768 dimensions — Pinecone index must be created with dimension 768.
 */

const EMBEDDING_MODEL = "text-embedding-004";
const EMBEDDING_DIMENSION = 768;

export { EMBEDDING_DIMENSION };

function getApiKey(): string {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set");
  return key;
}

export interface EmbedContentResponse {
  embedding: { values: number[] };
}

/**
 * Embed a single text. For batch, call in parallel or use embedTexts.
 */
export async function embedText(text: string): Promise<number[]> {
  const [vec] = await embedTexts([text]);
  return vec;
}

/**
 * Embed multiple texts. Gemini API supports batching in one request.
 * Returns 768-dimensional vectors (Pinecone index must use dimension 768).
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const apiKey = getApiKey();
  const results: number[][] = [];

  for (const text of texts) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: `models/${EMBEDDING_MODEL}`,
          content: { parts: [{ text }] },
        }),
      }
    );
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Gemini embed failed: ${res.status} ${err}`);
    }
    const data = (await res.json()) as EmbedContentResponse;
    results.push(data.embedding.values);
  }

  return results;
}
