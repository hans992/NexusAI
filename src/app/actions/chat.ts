"use server";

import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth-server";

export async function createSession(title = "New chat") {
  const userId = await getSessionUserId();
  return prisma.chatSession.create({
    data: { title, userId: userId ?? undefined },
  });
}

export async function getSessions() {
  const userId = await getSessionUserId();
  return prisma.chatSession.findMany({
    where: userId ? { userId } : {},
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: { id: true, title: true, updatedAt: true },
  });
}

export async function getSession(sessionId: string) {
  const userId = await getSessionUserId();
  const session = await prisma.chatSession.findFirst({
    where: { id: sessionId, ...(userId ? { userId } : {}) },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  return session;
}

export async function saveMessages(
  sessionId: string,
  messages: { role: string; content: string }[]
) {
  const userId = await getSessionUserId();
  const session = await prisma.chatSession.findFirst({
    where: { id: sessionId, ...(userId ? { userId } : {}) },
  });
  if (!session) return;
  await prisma.message.deleteMany({ where: { sessionId } });
  await prisma.chatSession.update({
    where: { id: sessionId },
    data: { updatedAt: new Date() },
  });
  if (messages.length === 0) return;
  await prisma.message.createMany({
    data: messages.map((m) => ({
      sessionId,
      role: m.role,
      content: m.content,
    })),
  });
}

export async function updateSessionTitle(sessionId: string, title: string) {
  const userId = await getSessionUserId();
  const session = await prisma.chatSession.findFirst({
    where: { id: sessionId, ...(userId ? { userId } : {}) },
  });
  if (!session) return null;
  return prisma.chatSession.update({
    where: { id: sessionId },
    data: { title: title.slice(0, 200) },
  });
}

export async function deleteSession(sessionId: string) {
  const userId = await getSessionUserId();
  const session = await prisma.chatSession.findFirst({
    where: { id: sessionId, ...(userId ? { userId } : {}) },
  });
  if (!session) return;
  await prisma.chatSession.delete({ where: { id: sessionId } });
}
