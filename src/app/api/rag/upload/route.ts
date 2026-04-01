import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/server/auth/session";
import { createServerSupabaseClient } from "@/server/db/supabase-server";
import { uploadPrivateDocument } from "@/server/storage/private-documents";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const rl = await rateLimit(`upload:${user.id}`, { limit: 10, windowMs: 60_000 });
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
    }
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file." }, { status: 400 });
    }

    const upload = await uploadPrivateDocument(file, user.id);
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from("documents")
      .insert({
        user_id: user.id,
        file_name: upload.fileName,
        storage_path: upload.storagePath,
        mime_type: upload.mimeType,
        file_size: upload.fileSize,
        status: "PENDING",
      })
      .select("id, file_name, mime_type, file_size, status")
      .single();

    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? "Failed creating document row." }, { status: 500 });
    }

    return NextResponse.json({
      documentId: data.id,
      fileName: data.file_name,
      mimeType: data.mime_type,
      fileSize: data.file_size,
      status: data.status,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed.";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

