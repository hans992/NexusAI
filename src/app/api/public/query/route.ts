import { NextResponse } from "next/server";
import { authenticateApiKey } from "@/lib/public-api-auth";
import { embedText } from "@/lib/gemini-embeddings";
import { getPineconeClient, getIndexName, getNamespaceForUser } from "@/lib/vector-db";
import { streamText } from "ai";
import { google } from "@ai-sdk/google";
import { keywordFallback, type ChunkWithScore } from "@/lib/keyword-fallback";
import { toSparseVector } from "@/lib/sparse-vector";

export async function POST(request: Request) {
  const auth = await authenticateApiKey(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    question?: string;
    selectedFile?: string | null;
  } | null;
  const question = body?.question?.trim();
  if (!question) {
    return NextResponse.json({ error: "Missing question" }, { status: 400 });
  }

  const queryVector = await embedText(question);
  const pinecone = getPineconeClient();
  const index = pinecone.index(getIndexName()).namespace(getNamespaceForUser(auth.userId));

  const queryOptions: Parameters<typeof index.query>[0] = {
    vector: queryVector,
    topK: 15,
    includeMetadata: true,
  };
  if (process.env.PINECONE_SPARSE_ENABLED === "true") {
    queryOptions.sparseVector = toSparseVector(question);
  }
  if (body?.selectedFile) {
    queryOptions.filter = { fileName: { $eq: body.selectedFile } };
  }

  const queryResult = await index.query(queryOptions);

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
  if (topScore < 0.65 && chunksWithMeta.length > 0) {
    const keywordFiltered = keywordFallback(chunksWithMeta as ChunkWithScore[], question);
    chunksWithMeta = (keywordFiltered.length > 0 ? keywordFiltered : chunksWithMeta).slice(0, 5) as ChunkMeta[];
  } else {
    chunksWithMeta = chunksWithMeta.slice(0, 5);
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

  const systemPrompt = `You are a document assistant. Based on the following document excerpts, answer the user's question. If the text does not contain the answer, say you don't know.\nAt the end of your answer, list the file names used to generate the response as source badges in this exact format: [Source: filename.pdf, Page N] (one per source; omit \", Page N\" if no page number is given in the excerpt label).\n\nDocument excerpts:\n${context}`;

  const result = await streamText({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    model: google("gemini-2.5-flash") as any,
    system: systemPrompt,
    messages: [{ role: "user", content: question }],
  });

  return result.toTextStreamResponse();
}

