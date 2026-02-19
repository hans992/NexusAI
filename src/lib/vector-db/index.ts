import { Pinecone } from "@pinecone-database/pinecone";

const globalForPinecone = globalThis as unknown as { pinecone: Pinecone | undefined };

export function getPineconeClient(): Pinecone {
  if (!globalForPinecone.pinecone) {
    const apiKey = process.env.PINECONE_API_KEY;
    if (!apiKey) throw new Error("PINECONE_API_KEY is not set");
    globalForPinecone.pinecone = new Pinecone({ apiKey });
  }
  return globalForPinecone.pinecone;
}

export function getIndexName(): string {
  return process.env.PINECONE_INDEX_NAME ?? "nexus-ai";
}
