export type RerankResult = { index: number; relevanceScore: number };

export async function cohereRerank(query: string, documents: string[], topN?: number): Promise<RerankResult[] | null> {
  const apiKey = process.env.COHERE_API_KEY;
  if (!apiKey) return null;

  const res = await fetch("https://api.cohere.com/v2/rerank", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "rerank-v4.0-fast",
      query,
      documents: documents.map((text) => ({ text })),
      top_n: topN,
    }),
  });

  if (!res.ok) return null;
  const data = (await res.json()) as { results?: { index: number; relevance_score: number }[] };
  if (!Array.isArray(data.results)) return null;

  return data.results
    .filter((r) => typeof r.index === "number" && typeof r.relevance_score === "number")
    .map((r) => ({ index: r.index, relevanceScore: r.relevance_score }));
}

