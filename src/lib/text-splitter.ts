/**
 * RecursiveCharacterTextSplitter-style chunking for RAG.
 * Chunk size 1000 chars, 200 char overlap so context isn't lost at boundaries.
 */

export interface TextChunk {
  text: string;
  index: number;
  startOffset: number;
  endOffset: number;
}

const DEFAULT_CHUNK_SIZE = 1000;
const DEFAULT_CHUNK_OVERLAP = 200;

/**
 * Splits a long string into overlapping chunks.
 * @param text - Full document text
 * @param chunkSize - Max characters per chunk (default 1000)
 * @param chunkOverlap - Overlap between consecutive chunks (default 200)
 * @returns Array of chunks with metadata
 */
export function splitTextIntoChunks(
  text: string,
  chunkSize: number = DEFAULT_CHUNK_SIZE,
  chunkOverlap: number = DEFAULT_CHUNK_OVERLAP
): TextChunk[] {
  if (!text?.trim()) return [];

  const chunks: TextChunk[] = [];
  let start = 0;
  let index = 0;

  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);

    // Prefer breaking at paragraph, then line, then space
    if (end < text.length) {
      const slice = text.slice(start, end);
      const lastNewline = slice.lastIndexOf("\n");
      const lastSpace = slice.lastIndexOf(" ");
      const breakAt = lastNewline >= chunkOverlap
        ? lastNewline + 1
        : lastSpace >= chunkOverlap
          ? lastSpace + 1
          : slice.length;
      end = start + breakAt;
    }

    const chunkText = text.slice(start, end).trim();
    if (chunkText) {
      chunks.push({
        text: chunkText,
        index,
        startOffset: start,
        endOffset: end,
      });
      index += 1;
    }

    // Move start forward, with overlap
    start = end - (end < text.length ? chunkOverlap : 0);
    if (start >= text.length) break;
    if (chunkOverlap > 0 && start === end) start = end;
  }

  return chunks;
}

/**
 * Sentence-aware chunking (semantic-ish).
 * Keeps sentences together, then applies an overlap window.
 */
export function splitTextIntoSemanticChunks(
  text: string,
  chunkSize: number = DEFAULT_CHUNK_SIZE,
  chunkOverlap: number = DEFAULT_CHUNK_OVERLAP
): TextChunk[] {
  if (!text?.trim()) return [];
  const sentences = text
    .replace(/\r\n/g, "\n")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9])/g);

  const chunks: TextChunk[] = [];
  let index = 0;
  let cursor = 0;

  let current = "";
  let currentStart = 0;

  const pushChunk = (chunkText: string, start: number, end: number) => {
    const trimmed = chunkText.trim();
    if (!trimmed) return;
    chunks.push({ text: trimmed, index, startOffset: start, endOffset: end });
    index += 1;
  };

  for (const s of sentences) {
    const sentence = s ?? "";
    const next = current ? `${current} ${sentence}` : sentence;

    if (next.length > chunkSize && current) {
      const end = cursor;
      pushChunk(current, currentStart, end);

      // overlap: keep tail of current chunk
      const tail = current.slice(Math.max(0, current.length - chunkOverlap));
      currentStart = Math.max(0, end - tail.length);
      current = tail ? `${tail} ${sentence}` : sentence;
    } else {
      if (!current) currentStart = cursor;
      current = next;
    }

    cursor += sentence.length + 1;
  }

  if (current.trim()) {
    pushChunk(current, currentStart, text.length);
  }

  return chunks;
}
