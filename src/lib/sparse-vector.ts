import type { RecordSparseValues } from "@pinecone-database/pinecone";

function fnv1a32(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, " ")
    .split(/\s+/g)
    .filter(Boolean);
}

/**
 * Minimal sparse vector generator for keyword-style hybrid search.
 * This is not full BM25, but provides keyword recall when combined with dense vectors.
 */
export function toSparseVector(text: string, dims = 200_000): RecordSparseValues {
  const tokens = tokenize(text);
  const counts = new Map<number, number>();

  for (const tok of tokens) {
    const idx = fnv1a32(tok) % dims;
    counts.set(idx, (counts.get(idx) ?? 0) + 1);
  }

  const indices = Array.from(counts.keys()).sort((a, b) => a - b);
  const values = indices.map((i) => counts.get(i) ?? 0);
  return { indices, values };
}

