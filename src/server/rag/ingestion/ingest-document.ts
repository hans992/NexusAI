import { createServerSupabaseClient } from "@/server/db/supabase-server";
import { downloadPrivateDocument } from "@/server/storage/private-documents";
import { extractTextFromBuffer } from "@/server/rag/ingestion/extract-text";
import { chunkDocumentText } from "@/server/rag/ingestion/chunk-document";
import { indexDocumentChunks } from "@/server/rag/indexing/index-document";

export async function ingestDocumentForUser(documentId: string, userId: string) {
  const supabase = await createServerSupabaseClient();

  const { data: doc, error: docError } = await supabase
    .from("documents")
    .select("id, user_id, file_name, storage_path, status")
    .eq("id", documentId)
    .eq("user_id", userId)
    .single();

  if (docError || !doc) {
    throw new Error("Document not found.");
  }

  if (doc.status === "PROCESSING") {
    return { chunksCount: 0, skipped: true };
  }

  await supabase
    .from("documents")
    .update({ status: "PROCESSING", error_message: null })
    .eq("id", documentId)
    .eq("user_id", userId);

  try {
    const buffer = await downloadPrivateDocument(doc.storage_path);
    const extracted = await extractTextFromBuffer(buffer, doc.file_name);
    const rawText = extracted.text?.trim() ?? "";
    if (!rawText) {
      throw new Error("No extractable text found in document.");
    }

    const visionPrefix = extracted.visionDescription ? `[Vision summary]\n${extracted.visionDescription}\n\n` : "";
    const chunks = chunkDocumentText(rawText).map((chunk, idx) => ({
      ...chunk,
      text: idx === 0 && visionPrefix ? `${visionPrefix}${chunk.text}` : chunk.text,
    }));

    await indexDocumentChunks({
      documentId,
      userId,
      fileName: doc.file_name,
      pageNumber: extracted.pageNumber,
      chunks,
    });

    await supabase
      .from("documents")
      .update({ status: "COMPLETE", chunks_count: chunks.length, error_message: null })
      .eq("id", documentId)
      .eq("user_id", userId);

    return { chunksCount: chunks.length, skipped: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ingest failed.";
    await supabase
      .from("documents")
      .update({ status: "FAILED", error_message: message.slice(0, 500) })
      .eq("id", documentId)
      .eq("user_id", userId);
    throw error;
  }
}

