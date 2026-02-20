# Nexus AI

Private document vault: upload files and get instant, cited answers.

## Stack

- **Next.js** (App Router) + **TypeScript** + **Tailwind** — UI and API
- **Pinecone** — vector store for embeddings
- **Google Gemini** — `text-embedding-004` (768 dims) for embeddings, `gemini-2.0-flash` for chat and vision
- **Prisma** + **PostgreSQL** — chat sessions and message history
- **pdf-parse** — PDF text extraction; **Gemini Vision** — PDF images/charts/tables description

## Setup

1. **Install and env**

   ```bash
   npm install
   cp .env.example .env
   ```

2. **Fill `.env`**

   - `GOOGLE_GENERATIVE_AI_API_KEY` — Google AI Studio API key (Gemini)
   - `DATABASE_URL` — PostgreSQL connection string (for Prisma chat history)
   - `PINECONE_API_KEY` — Pinecone API key
   - `PINECONE_ENVIRONMENT` — e.g. `us-east-1`
   - `PINECONE_INDEX_NAME` — index name (default `nexus-ai`)

3. **Database and Pinecone**

   - Run `npx prisma migrate dev` to create the PostgreSQL schema (ChatSession, Message).
   - Create a Pinecone index with dimension **768** (for Gemini `text-embedding-004`).

4. **Run**

   ```bash
   npm run dev
   ```

## Project layout

- `src/app/api/chat` — RAG chat API (Gemini + Pinecone + streaming)
- `src/app/api/upload` — file upload API (placeholder)
- `src/app/actions/ingest.ts` — **document ingestion**: file URL → extract text → chunk → embed → upsert Pinecone
- `src/lib/text-splitter.ts` — chunks of 1000 chars, 200 overlap
- `src/lib/vector-db/` — Pinecone client
- `src/components/upload/` — upload UI

## Document ingestion

The ingest pipeline:

1. **Fetch** file from URL (e.g. after upload).
2. **Extract** text (PDF via `pdf-parse`, else UTF-8).
3. **Chunk** with `splitTextIntoChunks(text, 1000, 200)`.
4. **Embed** with Gemini `text-embedding-004` (768 dims).
5. **Upsert** into Pinecone with metadata: `fileName`, `pageNumber`, `text` (snippet). For PDFs, Gemini Vision describes images/charts/tables and that is stored as metadata and prepended to the first chunk.

Call the server action from your upload flow:

```ts
import { ingestFromFileUrl } from "@/app/actions/ingest";

const result = await ingestFromFileUrl(fileUrl, fileName);
if (result.success) {
  console.log(`Ingested ${result.chunksCount} chunks`);
} else {
  console.error(result.error);
}
```

## Features

- **Hybrid search** — If the top vector score is below a threshold, a keyword fallback filters/ranks matches so specific terms (e.g. serial numbers) aren’t missed.
- **Conversation memory** — The last 4 messages are condensed with Gemini into a standalone question before searching Pinecone, so follow-ups like “Who managed it?” work.
- **Chat history** — Prisma stores ChatSession and Message; sidebar lists previous conversations and loads them on click.
- **Multi-modal ingest** — For PDFs, Gemini Vision describes images/charts/tables; that description is stored in Pinecone metadata and in the first chunk text.
- **Usage logging** — Pinecone query execution time and AI token usage (prompt/completion/total) are logged to the console.
