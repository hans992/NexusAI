import { streamText } from "ai";
import { google } from "@ai-sdk/google";
import { getPineconeClient, getIndexName, getNamespaceForUser } from "@/lib/vector-db";
import { embedText } from "@/lib/gemini-embeddings";
import { condenseConversationToQuery } from "@/lib/condense-query";
import { keywordFallback, type ChunkWithScore } from "@/lib/keyword-fallback";
import { getSessionFromRequestHeaders } from "@/lib/auth-server";
import { isAuthEnabled } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { toSparseVector } from "@/lib/sparse-vector";
import { cohereRerank } from "@/lib/rerank";
import { logger } from "@/lib/logger";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";

const TOP_K = 5;
const TOP_K_KEYWORD_FALLBACK = 15;
const VECTOR_SCORE_THRESHOLD = 0.65;

export async function POST(request: Request) {
  const pineconeStart = Date.now();
  try {
    const session = await getSessionFromRequestHeaders(request.headers);
    const userId = session?.user?.id ?? null;
    if (isAuthEnabled() && !userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const limiterKey = userId ? `chat:user:${userId}` : `chat:ip:${request.headers.get("x-forwarded-for") ?? "unknown"}`;
    const limit = await rateLimit(limiterKey, { limit: 10, windowMs: 60_000 });
    if (!limit.success) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    }

    const ChatBodySchema = z.object({
      messages: z.array(z.object({ role: z.string(), content: z.string() })).min(1),
      selectedFile: z.string().nullable().optional(),
      sessionId: z.string().optional(),
    });

    const parsed = ChatBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: "Invalid request body." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    const { messages, selectedFile, sessionId } = parsed.data;
    const lastUser = messages?.filter((m) => m.role === "user").pop();
    const rawQuestion = lastUser?.content?.trim();
    if (!rawQuestion) {
      return new Response(JSON.stringify({ error: "No question provided" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const lastFour = messages.slice(-4);
    const searchQuery =
      lastFour.length > 1
        ? await condenseConversationToQuery(lastFour, 4)
        : rawQuestion;
    const queryForEmbed = searchQuery || rawQuestion;

    const queryVector = await embedText(queryForEmbed);
    const indexName = getIndexName();
    const pinecone = getPineconeClient();
    const namespace = getNamespaceForUser(userId);
    const index = pinecone.index(indexName).namespace(namespace);
    const queryOptions: Parameters<typeof index.query>[0] = {
      vector: queryVector,
      topK: TOP_K_KEYWORD_FALLBACK,
      includeMetadata: true,
    };
    if (process.env.PINECONE_SPARSE_ENABLED === "true") {
      queryOptions.sparseVector = toSparseVector(queryForEmbed);
    }
    if (selectedFile && selectedFile !== "all") {
      queryOptions.filter = { fileName: { $eq: selectedFile } };
    }
    const queryResult = await index.query(queryOptions);
    const pineconeMs = Date.now() - pineconeStart;
    logger.info({ pineconeMs }, "[Nexus AI] Pinecone query");

    type ChunkMeta = { text: string; fileName?: string; pageNumber?: number; score?: number };
    let chunksWithMeta: ChunkMeta[] = (queryResult.matches ?? [])
      .filter((m) => m.metadata?.text)
      .map((m) => ({
        text: (m.metadata?.text as string) ?? "",
        fileName: m.metadata?.fileName as string | undefined,
        pageNumber: m.metadata?.pageNumber as number | undefined,
        score: typeof m.score === "number" ? m.score : undefined,
      }))
      .filter((c) => c.text);

    const topScore = chunksWithMeta[0]?.score ?? 0;
    if (topScore < VECTOR_SCORE_THRESHOLD && chunksWithMeta.length > 0) {
      const keywordFiltered = keywordFallback(
        chunksWithMeta as ChunkWithScore[],
        rawQuestion
      );
      if (keywordFiltered.length > 0) {
        chunksWithMeta = keywordFiltered.slice(0, TOP_K) as ChunkMeta[];
      } else {
        chunksWithMeta = chunksWithMeta.slice(0, TOP_K);
      }
    } else {
      chunksWithMeta = chunksWithMeta.slice(0, TOP_K);
    }

    // Optional reranking step (improves relevance ordering)
    if (process.env.COHERE_API_KEY && chunksWithMeta.length > 1) {
      const rerank = await cohereRerank(
        queryForEmbed,
        chunksWithMeta.map((c) => c.text),
        chunksWithMeta.length
      );
      if (rerank && rerank.length > 0) {
        chunksWithMeta = rerank
          .map((r) => chunksWithMeta[r.index])
          .filter(Boolean)
          .slice(0, TOP_K) as ChunkMeta[];
      }
    }

    const context =
      chunksWithMeta.length > 0
        ? chunksWithMeta
            .map(
              (c, i) =>
                `[Excerpt ${i + 1}${c.fileName ? ` | Source: ${c.fileName}${c.pageNumber != null ? `, Page ${c.pageNumber}` : ""}` : ""}]\n${c.text}`
            )
            .join("\n\n")
        : "No relevant excerpts in the database.";

    const systemPrompt = `You are a document assistant. Based on the following document excerpts, answer the user's question. If the text does not contain the answer, say you don't know.
At the end of your answer, list the file names used to generate the response as source badges in this exact format: [Source: filename.pdf, Page N] (one per source; omit ", Page N" if no page number is given in the excerpt label).

Document excerpts:
${context}`;

    const result = await streamText({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- @ai-sdk/google peer type mismatch with ai
      model: google("gemini-2.5-flash") as any,
      system: systemPrompt,
      messages: messages.map((m) => ({ role: m.role as "user" | "system" | "assistant", content: m.content })),
      onFinish: ({ usage }) => {
        const anyUsage = usage as unknown as {
          promptTokens?: number;
          completionTokens?: number;
          totalTokens?: number;
          inputTokens?: number | { total?: number };
          outputTokens?: number | { total?: number };
        } | undefined;
        const prompt =
          anyUsage?.promptTokens ??
          (typeof anyUsage?.inputTokens === "number" ? anyUsage.inputTokens : anyUsage?.inputTokens?.total);
        const completion =
          anyUsage?.completionTokens ??
          (typeof anyUsage?.outputTokens === "number" ? anyUsage.outputTokens : anyUsage?.outputTokens?.total);
        const total =
          anyUsage?.totalTokens ??
          (typeof prompt === "number" && typeof completion === "number" ? prompt + completion : undefined);
        logger.info(
          { promptTokens: prompt ?? null, completionTokens: completion ?? null, totalTokens: total ?? null },
          "[Nexus AI] Token usage"
        );

        // Persist minimal usage analytics (optional)
        void prisma.usageEvent
          .create({
            data: {
              userId: userId ?? null,
              sessionId: sessionId ?? null,
              type: "chat",
              pineconeMs,
              promptTokens: typeof prompt === "number" ? prompt : null,
              completionTokens: typeof completion === "number" ? completion : null,
              totalTokens: typeof total === "number" ? total : null,
            },
          })
          .catch(() => {});

        void prisma.auditLog
          .create({
            data: {
              userId: userId ?? null,
              action: "chat.query",
              resourceId: sessionId ?? null,
              metadata: {
                selectedFile: selectedFile ?? null,
                pineconeMs,
              },
            },
          })
          .catch(() => {});
      },
    });

    return result.toTextStreamResponse();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Chat failed.";
    logger.error({ err }, "[Nexus AI] Chat failed");
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
