import { embedText } from "@/lib/gemini-embeddings";
import { createServerSupabaseClient } from "@/server/db/supabase-server";
import type { RetrievedChunk } from "@/server/rag/contracts/types";

export async function retrieveRelevantChunks(params: {
  userId: string;
  question: string;
  selectedDocumentId?: string | null;
  topK?: number;
}): Promise<RetrievedChunk[]> {
  const supabase = await createServerSupabaseClient();
  const embedding = await embedText(params.question);
  const topK = params.topK ?? 5;

  const { data, error } = await supabase.rpc("match_document_chunks", {
    query_embedding: embedding,
    match_count: topK,
    filter_document_id: params.selectedDocumentId ?? null,
  });

  if (error) {
    throw new Error(`Failed retrieving chunks: ${error.message}`);
  }

  return (data ?? []) as RetrievedChunk[];
}

