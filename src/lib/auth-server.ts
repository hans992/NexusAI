import { headers } from "next/headers";
import { auth, isAuthEnabled } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function getSessionUserId(): Promise<string | null> {
  if (!isAuthEnabled() || !auth) return null;
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    return session?.user?.id ?? null;
  } catch {
    return null;
  }
}

export async function getSessionFromRequestHeaders(
  reqHeaders: Headers
): Promise<{ user?: { id: string; email?: string } } | null> {
  if (!isAuthEnabled() || !auth) return null;
  try {
    return await auth.api.getSession({ headers: reqHeaders });
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<{ id: string; role: string; email: string } | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, email: true },
  });
  return user ? { id: user.id, role: user.role, email: user.email } : null;
}
