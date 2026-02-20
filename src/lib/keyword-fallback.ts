/**
 * Extracts significant keywords from a question (e.g. for "XY-500 serial number" -> ["XY-500", "serial", "number"]).
 * Used when vector search score is low to fall back to keyword matching.
 */
export function extractKeywords(question: string, minLength = 2): string[] {
  const normalized = question
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= minLength && !/^\d+$/.test(w));
  const stop = new Set(["what", "which", "who", "where", "when", "how", "the", "is", "are", "was", "were", "a", "an", "it", "its", "this", "that", "for", "to", "of", "in", "on", "and", "or"]);
  return [...new Set(normalized.filter((w) => !stop.has(w)))];
}

export type ChunkWithScore = {
  text: string;
  fileName?: string;
  pageNumber?: number;
  score?: number;
};

/**
 * When vector score is low, filter/rank matches by keyword presence in text.
 * Keeps matches that contain at least one keyword (and sorts by number of keyword hits).
 */
export function keywordFallback(
  matches: ChunkWithScore[],
  question: string
): ChunkWithScore[] {
  const keywords = extractKeywords(question);
  if (keywords.length === 0) return matches;

  const scored = matches.map((m) => {
    const lower = m.text.toLowerCase();
    const hits = keywords.filter((k) => lower.includes(k)).length;
    return { ...m, keywordHits: hits };
  });
  const withHits = scored.filter((m) => m.keywordHits > 0);
  if (withHits.length === 0) return matches;
  withHits.sort((a, b) => (b.keywordHits ?? 0) - (a.keywordHits ?? 0));
  return withHits.map(({ keywordHits: _, ...m }) => m);
}
