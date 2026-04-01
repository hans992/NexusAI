export type DocumentRecord = {
  id: string;
  user_id: string;
  file_name: string;
  storage_path: string;
  mime_type: string;
  file_size: number;
  chunks_count: number;
  status: "PENDING" | "PROCESSING" | "COMPLETE" | "FAILED";
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type RetrievedChunk = {
  chunk_id: string;
  document_id: string;
  file_name: string;
  content: string;
  page_number: number | null;
  metadata: Record<string, unknown>;
  score: number;
};

