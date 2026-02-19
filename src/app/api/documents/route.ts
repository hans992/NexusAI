import { NextResponse } from "next/server";
import { getPineconeClient, getIndexName } from "@/lib/vector-db";
import { embedText } from "@/lib/gemini-embeddings";

/**
 * Returns a list of unique file names that have been ingested into the vault.
 * Uses a single Pinecone query to sample records and extract metadata.
 */
export async function GET() {
  try {
    const queryVector = await embedText("document");
    const indexName = getIndexName();
    const pinecone = getPineconeClient();
    const index = pinecone.index(indexName);
    const result = await index.query({
      vector: queryVector,
      topK: 500,
      includeMetadata: true,
    });
    const names = new Set<string>();
    for (const m of result.matches ?? []) {
      const name = m.metadata?.fileName;
      if (typeof name === "string") names.add(name);
    }
    return NextResponse.json(Array.from(names).sort());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list documents.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
