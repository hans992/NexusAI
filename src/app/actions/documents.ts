"use server";

import { prisma } from "@/lib/db";
import { ingestFromFileUrl } from "@/app/actions/ingest";
import { IngestStatus } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth-server";
import { isAuthEnabled } from "@/lib/auth";
import { getPineconeClient, getIndexName, getNamespaceForUser } from "@/lib/vector-db";
import { rateLimit } from "@/lib/rate-limit";

const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

function isAllowedMime(mime: string): boolean {
  return ALLOWED_MIME_TYPES.some((t) => mime === t || mime.startsWith("text/"));
}

/**
 * Creates a Document record (PENDING), runs ingest from file URL, then updates
 * Document to COMPLETE (with chunksCount) or FAILED.
 */
export async function createDocumentAndIngest(
  fileUrl: string,
  fileName: string,
  fileSize: number,
  mimeType: string,
  userId?: string | null
): Promise<{ success: true; documentId: string; chunksCount: number } | { success: false; error: string }> {
  const currentUser = userId ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } }) : await getCurrentUser();
  const resolvedUserId = currentUser?.id ?? null;
  if (isAuthEnabled() && !resolvedUserId) {
    return { success: false, error: "Unauthorized." };
  }
  if (currentUser?.role === "VIEWER") {
    return { success: false, error: "Your role does not allow uploading documents." };
  }
  if (resolvedUserId) {
    const rl = await rateLimit(`ingest:user:${resolvedUserId}`, { limit: 10, windowMs: 60_000 });
    if (!rl.success) return { success: false, error: "Rate limit exceeded. Please try again shortly." };
  }
  if (!isAllowedMime(mimeType)) {
    return { success: false, error: "File type not allowed. Use PDF, TXT, or MD." };
  }
  const MAX_SIZE = 50 * 1024 * 1024; // 50 MB
  if (fileSize > MAX_SIZE) {
    return { success: false, error: "File too large. Maximum size is 50 MB." };
  }
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 255) || "document";

  const doc = await prisma.document.create({
    data: {
      userId: resolvedUserId ?? null,
      fileName: safeName,
      fileUrl,
      fileSize,
      mimeType,
      status: IngestStatus.PROCESSING,
    },
  });

  const result = await ingestFromFileUrl(fileUrl, safeName, {
    userId: resolvedUserId ?? null,
    documentId: doc.id,
  });

  if (result.success) {
    await prisma.document.update({
      where: { id: doc.id },
      data: { status: IngestStatus.COMPLETE, chunksCount: result.chunksCount },
    });
    return { success: true, documentId: doc.id, chunksCount: result.chunksCount };
  }

  await prisma.document.update({
    where: { id: doc.id },
    data: { status: IngestStatus.FAILED },
  });
  return { success: false, error: result.error };
}

export async function deleteDocument(documentId: string): Promise<{ success: true } | { success: false; error: string }> {
  const currentUser = await getCurrentUser();
  const userId = currentUser?.id ?? null;
  if (isAuthEnabled() && !userId) return { success: false, error: "Unauthorized." };
  if (currentUser?.role === "VIEWER") return { success: false, error: "Your role does not allow deleting documents." };

  const doc = await prisma.document.findFirst({
    where: { id: documentId, ...(userId ? { userId } : {}) },
  });
  if (!doc) return { success: false, error: "Document not found." };

  try {
    const pinecone = getPineconeClient();
    const index = pinecone.index(getIndexName()).namespace(getNamespaceForUser(userId));
    await index.deleteMany({ documentId: doc.id });
  } catch {
    // Non-fatal: still allow DB delete
  }

  await prisma.document.delete({ where: { id: doc.id } });
  void prisma.auditLog
    .create({
      data: { userId: userId ?? null, action: "document.delete", resourceId: doc.id, metadata: { fileName: doc.fileName } },
    })
    .catch(() => {});
  return { success: true };
}
