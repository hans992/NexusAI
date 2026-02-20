import { streamText } from "ai";
import { google } from "@ai-sdk/google";
import { getPineconeClient, getIndexName } from "@/lib/vector-db";
import { embedText } from "@/lib/gemini-embeddings";
import { condenseConversationToQuery } from "@/lib/condense-query";
import { keywordFallback, type ChunkWithScore } from "@/lib/keyword-fallback";

const TOP_K = 5;
const TOP_K_KEYWORD_FALLBACK = 15;
const VECTOR_SCORE_THRESHOLD = 0.65;

export async function POST(request: Request) {
  const pineconeStart = Date.now();
  try {
    const body = (await request.json()) as {
      messages: { role: string; content: string }[];
      selectedFile?: string | null;
    };
    const { messages, selectedFile } = body;
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
    const index = pinecone.index(indexName);
    const queryOptions: Parameters<typeof index.query>[0] = {
      vector: queryVector,
      topK: TOP_K_KEYWORD_FALLBACK,
      includeMetadata: true,
    };
    if (selectedFile && selectedFile !== "all") {
      queryOptions.filter = { fileName: { $eq: selectedFile } };
    }
    const queryResult = await index.query(queryOptions);
    const pineconeMs = Date.now() - pineconeStart;
    console.log(`[Nexus AI] Pinecone query execution time: ${pineconeMs}ms`);

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
      model: google("gemini-2.0-flash") as any,
      system: systemPrompt,
      messages: messages.map((m) => ({ role: m.role as "user" | "system" | "assistant", content: m.content })),
      onFinish: ({ usage }) => {
        console.log(
          `[Nexus AI] Token usage - prompt: ${usage?.promptTokens ?? "?"}, completion: ${usage?.completionTokens ?? "?"}, total: ${usage?.totalTokens ?? "?"}`
        );
      },
    });

    return result.toDataStreamResponse();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Chat failed.";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
