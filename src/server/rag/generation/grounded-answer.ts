import { streamText } from "ai";
import { google } from "@ai-sdk/google";
import type { RetrievedChunk } from "@/server/rag/contracts/types";

function buildContext(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "No relevant excerpts found.";
  return chunks
    .map((chunk, idx) => {
      const page = chunk.page_number ? `, Page ${chunk.page_number}` : "";
      return `[Excerpt ${idx + 1} | Source: ${chunk.file_name}${page}]\n${chunk.content}`;
    })
    .join("\n\n");
}

export async function generateGroundedAnswer(params: {
  messages: { role: string; content: string }[];
  chunks: RetrievedChunk[];
  onFinish?: (usage: {
    inputTokens?: number | { total?: number };
    outputTokens?: number | { total?: number };
    totalTokens?: number;
  }) => Promise<void> | void;
}) {
  const context = buildContext(params.chunks);

  const systemPrompt = `You are Nexus, a private enterprise assistant.
Only answer from the retrieved excerpts below. If the excerpts do not contain the answer, say you do not know.
Always add source badges in this exact format: [Source: filename.pdf, Page N].

Security policy:
- Never claim to have read full original documents.
- Use only the provided excerpts.

Retrieved excerpts:
${context}`;

  // Security note:
  // We intentionally send only top-k retrieved excerpts to Gemini (not full documents),
  // which enforces a zero-retention-style minimization boundary for sensitive data.
  return streamText({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ai-sdk/google type compatibility
    model: google("gemini-2.5-flash") as any,
    system: systemPrompt,
    messages: params.messages.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    })),
    onFinish: async ({ usage }) => {
      await params.onFinish?.(usage as {
        inputTokens?: number | { total?: number };
        outputTokens?: number | { total?: number };
        totalTokens?: number;
      });
    },
  });
}

