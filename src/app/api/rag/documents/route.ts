import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/server/auth/session";
import { createServerSupabaseClient } from "@/server/db/supabase-server";
import { deletePrivateDocument, getSignedDocumentUrl } from "@/server/storage/private-documents";
import { rateLimit } from "@/lib/rate-limit";
import { getDocumentForUser, listDocumentsForUser } from "@/server/db/repositories/documents-repository";

export async function GET() {
  try {
    const user = await requireAuthenticatedUser();
    const data = await listDocumentsForUser(user.id);

    const withUrls = await Promise.all(
      (data ?? []).map(async (doc) => ({
        id: doc.id,
        fileName: doc.file_name,
        fileUrl: await getSignedDocumentUrl(doc.storage_path, 120),
        fileSize: doc.file_size,
        mimeType: doc.mime_type,
        chunksCount: doc.chunks_count,
        status: doc.status,
        createdAt: doc.created_at,
      }))
    );

    return NextResponse.json(withUrls);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list documents.";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const rl = await rateLimit(`delete-doc:${user.id}`, { limit: 20, windowMs: 60_000 });
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
    }
    const { documentId } = (await request.json()) as { documentId?: string };
    if (!documentId) {
      return NextResponse.json({ error: "Missing documentId." }, { status: 400 });
    }

    const doc = await getDocumentForUser(documentId, user.id);
    if (!doc) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }

    const supabase = await createServerSupabaseClient();
    await deletePrivateDocument(doc.storage_path);
    const { error: deleteError } = await supabase.from("documents").delete().eq("id", documentId).eq("user_id", user.id);
    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete document.";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

