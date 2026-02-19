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
