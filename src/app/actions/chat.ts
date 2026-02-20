"use server";

import { prisma } from "@/lib/db";

export async function createSession(title = "New chat") {
  return prisma.chatSession.create({ data: { title } });
}

export async function getSessions() {
  return prisma.chatSession.findMany({
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: { id: true, title: true, updatedAt: true },
  });
}

export async function getSession(sessionId: string) {
  return prisma.chatSession.findUnique({
    where: { id: sessionId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
}

export async function saveMessages(
  sessionId: string,
  messages: { role: string; content: string }[]
) {
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
  return prisma.chatSession.update({
    where: { id: sessionId },
    data: { title: title.slice(0, 200) },
  });
}

export async function deleteSession(sessionId: string) {
  return prisma.chatSession.delete({ where: { id: sessionId } });
}
