import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/server/auth/session";
import { IngestRequestSchema } from "@/server/rag/contracts/schemas";
import { ingestDocumentForUser } from "@/server/rag/ingestion/ingest-document";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const rl = await rateLimit(`ingest:${user.id}`, { limit: 10, windowMs: 60_000 });
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
    }
    const parsed = IngestRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const result = await ingestDocumentForUser(parsed.data.documentId, user.id);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ingestion failed.";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

