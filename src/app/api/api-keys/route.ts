import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isAuthEnabled } from "@/lib/auth";
import { getSessionFromRequestHeaders } from "@/lib/auth-server";
import { generateApiKey } from "@/lib/api-keys";

export async function GET(request: Request) {
  const session = await getSessionFromRequestHeaders(request.headers);
  const userId = session?.user?.id ?? null;
  if (isAuthEnabled() && !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!userId) return NextResponse.json([]);

  const keys = await prisma.apiKey.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, prefix: true, lastUsedAt: true, createdAt: true },
  });
  return NextResponse.json(keys);
}

export async function POST(request: Request) {
  const session = await getSessionFromRequestHeaders(request.headers);
  const userId = session?.user?.id ?? null;
  if (isAuthEnabled() && !userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { name?: string };
  const name = (body.name ?? "API Key").slice(0, 80);

  const { plaintext, prefix, hash } = generateApiKey();
  await prisma.apiKey.create({
    data: { userId, name, prefix, hashedKey: hash },
  });

  // Only return plaintext once
  return NextResponse.json({ name, prefix, apiKey: plaintext });
}

