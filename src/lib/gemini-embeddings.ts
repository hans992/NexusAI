/**
 * Gemini embeddings via REST API.
 *
 * Defaults are chosen to work with the Supabase `vector(768)` schema.
 * - Primary model: `gemini-embedding-001`
 * - Output dimensionality: 768
 */

const DEFAULT_EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_MODEL = process.env.GEMINI_EMBEDDING_MODEL ?? DEFAULT_EMBEDDING_MODEL;
const EMBEDDING_DIMENSION = Number(process.env.GEMINI_EMBEDDING_DIMENSION ?? 768);

export { EMBEDDING_DIMENSION };

function getApiKey(): string {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is not set");
  return key;
}

export interface EmbedContentResponse {
  embedding: { values: number[] };
}

type EmbedAttempt = {
  apiVersion: "v1beta" | "v1";
  model: string;
};

async function embedWithAttempt(text: string, apiKey: string, attempt: EmbedAttempt): Promise<number[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/${attempt.apiVersion}/models/${attempt.model}:embedContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: `models/${attempt.model}`,
        content: { parts: [{ text }] },
        outputDimensionality: EMBEDDING_DIMENSION,
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini embed failed (${attempt.apiVersion}/${attempt.model}): ${res.status} ${err}`);
  }

  const data = (await res.json()) as EmbedContentResponse;
  const values = data.embedding?.values ?? [];
  if (values.length !== EMBEDDING_DIMENSION) {
    throw new Error(
      `Gemini returned ${values.length} embedding dims, expected ${EMBEDDING_DIMENSION}. Check GEMINI_EMBEDDING_DIMENSION and DB vector size.`
    );
  }
  return values;
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
  const attempts: EmbedAttempt[] = [
    { apiVersion: "v1beta", model: EMBEDDING_MODEL },
    { apiVersion: "v1beta", model: DEFAULT_EMBEDDING_MODEL },
    { apiVersion: "v1", model: DEFAULT_EMBEDDING_MODEL },
  ];

  for (const text of texts) {
    let lastError: Error | null = null;
    for (const attempt of attempts) {
      try {
        const values = await embedWithAttempt(text, apiKey, attempt);
        results.push(values);
        lastError = null;
        break;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }
    if (lastError) {
      throw lastError;
    }
  }

  return results;
}
