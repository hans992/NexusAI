import { generateText } from "ai";
import { google } from "@ai-sdk/google";

/**
 * Condenses the last N messages of conversation history into a single standalone question
 * so that RAG search can use context (e.g. "Who managed it?" -> "Who managed the profit?").
 */
export async function condenseConversationToQuery(
  messages: { role: string; content: string }[],
  maxMessages = 4
): Promise<string> {
  const recent = messages.slice(-maxMessages);
  if (recent.length === 0) return "";
  const last = recent[recent.length - 1];
  if (last?.role !== "user") return last?.content?.trim() ?? "";

  const conversation = recent
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");

  const { text } = await generateText({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: google("gemini-2.5-flash") as any,
    system: `You are a query rewriter. Given a conversation and the latest user message, output a single standalone question that captures what the user is asking, including any context from the conversation (e.g. pronouns like "it", "that" should be resolved). Output only the question, no explanation.`,
    prompt: `Conversation:\n${conversation}\n\nStandalone question:`,
    maxTokens: 150,
  });

  return text.trim() || last.content?.trim() || "";
}
