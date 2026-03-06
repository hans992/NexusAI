import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/public-api-auth";
import { createDocumentAndIngest } from "@/app/actions/documents";

export async function POST(request: Request) {
  const auth = await authenticateApiKey(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    fileUrl?: string;
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
  } | null;

  if (!body?.fileUrl || !body.fileName || typeof body.fileUrl !== "string" || typeof body.fileName !== "string") {
    return NextResponse.json({ error: "Missing fileUrl or fileName" }, { status: 400 });
  }

  const result = await createDocumentAndIngest(
    body.fileUrl,
    body.fileName,
    Number(body.fileSize ?? 0),
    body.mimeType ?? "application/octet-stream",
    auth.userId
  );

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}

