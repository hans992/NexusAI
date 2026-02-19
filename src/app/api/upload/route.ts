import { NextResponse } from "next/server";

export async function POST(request: Request) {
  // TODO: Handle file upload (e.g. Uploadthing), return file URL for ingest
  return NextResponse.json({ message: "Upload API placeholder" }, { status: 501 });
}
