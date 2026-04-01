import { splitTextIntoChunks, splitTextIntoSemanticChunks } from "@/lib/text-splitter";

export type ChunkResult = {
  chunkIndex: number;
  text: string;
  tokenEstimate: number;
};

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function chunkDocumentText(text: string): ChunkResult[] {
  const useSemantic = process.env.RAG_CHUNKING === "semantic";
  const chunks = useSemantic ? splitTextIntoSemanticChunks(text, 1000, 200) : splitTextIntoChunks(text, 1000, 200);

  return chunks.map((chunk, idx) => ({
    chunkIndex: idx,
    text: chunk.text,
    tokenEstimate: estimateTokens(chunk.text),
  }));
}

