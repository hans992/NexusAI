import { createServerSupabaseClient } from "@/server/db/supabase-server";

export const PRIVATE_DOCUMENTS_BUCKET = "documents-private";
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200) || "document.txt";
}

export function validateUploadInput(file: File) {
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new Error("Unsupported file type. Use PDF, DOCX, or TXT.");
  }
  if (file.size <= 0 || file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error("File size must be between 1B and 50MB.");
  }
}

export async function uploadPrivateDocument(file: File, userId: string) {
  validateUploadInput(file);
  const supabase = await createServerSupabaseClient();
  const safeName = sanitizeName(file.name);
  const storagePath = `${userId}/${crypto.randomUUID()}-${safeName}`;

  const { error } = await supabase.storage
    .from(PRIVATE_DOCUMENTS_BUCKET)
    .upload(storagePath, file, { contentType: file.type, upsert: false });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  return {
    storagePath,
    fileName: safeName,
    mimeType: file.type,
    fileSize: file.size,
  };
}

export async function downloadPrivateDocument(storagePath: string): Promise<Buffer> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.storage.from(PRIVATE_DOCUMENTS_BUCKET).download(storagePath);
  if (error || !data) {
    throw new Error(`Failed to download document: ${error?.message ?? "unknown error"}`);
  }
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function deletePrivateDocument(storagePath: string): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.storage.from(PRIVATE_DOCUMENTS_BUCKET).remove([storagePath]);
  if (error) {
    throw new Error(`Failed to delete file from storage: ${error.message}`);
  }
}

export async function getSignedDocumentUrl(storagePath: string, expiresInSeconds = 60): Promise<string> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.storage
    .from(PRIVATE_DOCUMENTS_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);
  if (error || !data?.signedUrl) {
    throw new Error("Failed to create signed URL.");
  }
  return data.signedUrl;
}

