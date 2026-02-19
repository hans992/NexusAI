"use server";

import { getPineconeClient, getIndexName } from "@/lib/vector-db";
import { splitTextIntoChunks } from "@/lib/text-splitter";
import { embedTexts } from "@/lib/gemini-embeddings";

/**
 * Gemini text-embedding-004 produces 768-dimensional vectors.
 * Your Pinecone index must be created with dimension 768 (not 1536).
 */

const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB

export type IngestResult = { success: true; chunksCount: number } | { success: false; error: string };

function normalizeIngestError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  const lower = message.toLowerCase();
  if (lower.includes("file too large") || lower.includes("entity too large") || lower.includes("payload too large")) {
    return "File too large.";
  }
  if (lower.includes("rate limit") || lower.includes("429") || lower.includes("quota") || lower.includes("resource_exhausted")) {
    return "API rate limit exceeded. Please try again in a few minutes.";
  }
  return message || "Ingest failed.";
}

/**
 * Fetches content from a file URL, extracts text, chunks it, generates embeddings,
 * and upserts into Pinecone with metadata (fileName, pageNumber when available).
 */
export async function ingestFromFileUrl(
  fileUrl: string,
  fileName: string
): Promise<IngestResult> {
  try {
    const buffer = await fetchFileAsBuffer(fileUrl);
    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      return { success: false, error: "File too large." };
    }
    const { text, pageNumber } = await extractTextFromBuffer(buffer, fileName);

    if (!text?.trim()) {
      return { success: false, error: "No text could be extracted from the file." };
    }

    const chunks = splitTextIntoChunks(text, 1000, 200);
    const embeddings = await embedTexts(chunks.map((c) => c.text));

    const indexName = getIndexName();
    const pinecone = getPineconeClient();
    const index = pinecone.index(indexName);

    const records = chunks.map((chunk, i) => ({
      id: `${sanitizeId(fileName)}-${i}-${Date.now()}`,
      values: embeddings[i]!,
      metadata: {
        fileName,
        pageNumber: pageNumber ?? 1,
        text: chunk.text.slice(0, 1000),
      },
    }));

    await index.upsert(records);

    return { success: true, chunksCount: chunks.length };
  } catch (err) {
    return { success: false, error: normalizeIngestError(err) };
  }
}

/**
 * Ingest from an in-memory buffer (e.g. from multipart upload).
 * Metadata includes fileName and pageNumber when available.
 */
export async function ingestFromBuffer(
  buffer: Buffer,
  fileName: string
): Promise<IngestResult> {
  try {
    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      return { success: false, error: "File too large." };
    }
    const { text, pageNumber } = await extractTextFromBuffer(buffer, fileName);

    if (!text?.trim()) {
      return { success: false, error: "No text could be extracted from the file." };
    }

    const chunks = splitTextIntoChunks(text, 1000, 200);
    const embeddings = await embedTexts(chunks.map((c) => c.text));

    const indexName = getIndexName();
    const pinecone = getPineconeClient();
    const index = pinecone.index(indexName);

    const records = chunks.map((chunk, i) => ({
      id: `${sanitizeId(fileName)}-${i}-${Date.now()}`,
      values: embeddings[i]!,
      metadata: {
        fileName,
        pageNumber: pageNumber ?? 1,
        text: chunk.text.slice(0, 1000),
      },
    }));

    await index.upsert(records);

    return { success: true, chunksCount: chunks.length };
  } catch (err) {
    return { success: false, error: normalizeIngestError(err) };
  }
}

async function fetchFileAsBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch file: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function extractTextFromBuffer(
  buffer: Buffer,
  fileName: string
): Promise<{ text: string; pageNumber?: number }> {
  const ext = fileName.split(".").pop()?.toLowerCase();

  if (ext === "pdf") {
    const pdfParseModule = await import("pdf-parse");
    const fn =
      (pdfParseModule as { default?: (b: Buffer) => Promise<{ text?: string; numpages?: number }> }).default ??
      (pdfParseModule as unknown as (b: Buffer) => Promise<{ text?: string; numpages?: number }>);
    const data = await fn(buffer);
    return {
      text: data.text ?? "",
      pageNumber: data.numpages ? 1 : undefined,
    };
  }

  return {
    text: buffer.toString("utf-8"),
    pageNumber: 1,
  };
}

function sanitizeId(name: string): string {
  return name.replace(/[^a-zA-Z0-9-_]/g, "_").slice(0, 100);
}
