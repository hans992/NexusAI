import { prisma } from "@/lib/db";
import { hashApiKey } from "@/lib/api-keys";

export async function authenticateApiKey(request: Request): Promise<{ userId: string } | null> {
  const auth = request.headers.get("authorization") ?? "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  if (!token) return null;

  const hashed = hashApiKey(token);
  const key = await prisma.apiKey.findFirst({
    where: { hashedKey: hashed },
    select: { userId: true, id: true },
  });
  if (!key) return null;

  await prisma.apiKey.update({
    where: { id: key.id },
    data: { lastUsedAt: new Date() },
  });

  return { userId: key.userId };
}

