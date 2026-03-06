import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { isAuthEnabled } from "@/lib/auth";
import { getSessionFromRequestHeaders } from "@/lib/auth-server";

/**
 * Returns documents from the database (Prisma Document model), scoped by current user.
 */
export async function GET() {
  try {
    const session = await getSessionFromRequestHeaders(await headers());
    const userId = session?.user?.id ?? null;
    if (isAuthEnabled() && !userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const documents = await prisma.document.findMany({
      where: userId ? { userId } : {},
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        fileName: true,
        fileUrl: true,
        fileSize: true,
        mimeType: true,
        chunksCount: true,
        status: true,
        createdAt: true,
      },
    });
    return NextResponse.json(documents);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list documents.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
