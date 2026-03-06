import { NextResponse } from "next/server";
import { ingestFromBuffer } from "@/app/actions/ingest";

const ALLOWED_MIME = ["application/pdf", "text/plain", "text/markdown"];

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    const mime = file.type?.toLowerCase() || "";
    const allowed = ALLOWED_MIME.some((t) => mime === t) || mime.startsWith("text/");
    if (!allowed) {
      return NextResponse.json({ error: "File type not allowed. Use PDF, TXT, or MD." }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await ingestFromBuffer(buffer, file.name);
    if (result.success) {
      return NextResponse.json({ success: true, chunksCount: result.chunksCount });
    }
    return NextResponse.json({ error: result.error }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ingest failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
