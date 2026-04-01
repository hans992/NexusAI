import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/server/auth/session";
import { QueryRequestSchema } from "@/server/rag/contracts/schemas";
import { retrieveRelevantChunks } from "@/server/rag/retrieval/retrieve-chunks";
import { generateGroundedAnswer } from "@/server/rag/generation/grounded-answer";
import { createServerSupabaseClient } from "@/server/db/supabase-server";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const rl = await rateLimit(`query:${user.id}`, { limit: 20, windowMs: 60_000 });
    if (!rl.success) {
      return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
    }
    const parsed = QueryRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    const lastUserMessage = [...parsed.data.messages].reverse().find((m) => m.role === "user");
    const question = lastUserMessage?.content?.trim();
    if (!question) {
      return NextResponse.json({ error: "No question provided." }, { status: 400 });
    }

    const retrieveStart = Date.now();
    const chunks = await retrieveRelevantChunks({
      userId: user.id,
      question,
      selectedDocumentId: parsed.data.selectedDocumentId ?? null,
      topK: 5,
    });

    const retrievalMs = Date.now() - retrieveStart;
    const result = await generateGroundedAnswer({
      messages: parsed.data.messages,
      chunks,
      onFinish: async (usage) => {
        const supabase = await createServerSupabaseClient();
        const inputTokens =
          typeof usage.inputTokens === "number" ? usage.inputTokens : usage.inputTokens?.total ?? null;
        const outputTokens =
          typeof usage.outputTokens === "number" ? usage.outputTokens : usage.outputTokens?.total ?? null;
        const total =
          usage.totalTokens ?? (typeof inputTokens === "number" && typeof outputTokens === "number" ? inputTokens + outputTokens : null);

        await supabase.from("usage_events").insert({
          user_id: user.id,
          session_id: parsed.data.sessionId ?? null,
          type: "chat",
          prompt_tokens: inputTokens,
          completion_tokens: outputTokens,
          total_tokens: typeof total === "number" ? total : null,
          retrieval_ms: retrievalMs,
          metadata: { retrieved_chunks: chunks.length },
        });
      },
    });

    return result.toTextStreamResponse();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Query failed.";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

