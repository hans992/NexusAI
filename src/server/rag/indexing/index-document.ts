import { embedTexts } from "@/lib/gemini-embeddings";
import { createServerSupabaseClient } from "@/server/db/supabase-server";
import type { ChunkResult } from "@/server/rag/ingestion/chunk-document";
import { toPgVectorLiteral } from "@/server/rag/indexing/pgvector";

export async function indexDocumentChunks(params: {
  documentId: string;
  userId: string;
  fileName: string;
  pageNumber?: number;
  chunks: ChunkResult[];
}) {
  const supabase = await createServerSupabaseClient();
  const chunkTexts = params.chunks.map((c) => c.text);
  const embeddings = await embedTexts(chunkTexts);

  const rows = params.chunks.map((chunk, index) => ({
    document_id: params.documentId,
    user_id: params.userId,
    chunk_index: chunk.chunkIndex,
    content: chunk.text,
    page_number: params.pageNumber ?? 1,
    token_count: chunk.tokenEstimate,
    metadata: { fileName: params.fileName, chunkIndex: chunk.chunkIndex },
    embedding: toPgVectorLiteral(embeddings[index] ?? []),
  }));

  // Idempotent re-indexing for retries.
  const { error: deleteError } = await supabase.from("document_chunks").delete().eq("document_id", params.documentId);
  if (deleteError) {
    throw new Error(`Failed clearing previous chunks: ${deleteError.message}`);
  }

  const { error } = await supabase.from("document_chunks").insert(rows);
  if (error) {
    throw new Error(`Failed indexing chunks: ${error.message}`);
  }
}

