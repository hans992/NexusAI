# Nexus AI

Private document vault: upload files and get instant, cited answers.

## Stack

- **Next.js** (App Router) + **TypeScript** + **Tailwind** — UI and API
- **Pinecone** — vector store for embeddings
- **Google Gemini** — `text-embedding-004` (768 dims) for embeddings, `gemini-2.5-flash` for chat and vision
- **Prisma** + **PostgreSQL** — users, documents, chat history, audit logs, API keys
- **UploadThing** — file uploads (PDF/TXT/MD/DOCX/XLSX)
- **pdf-parse** — PDF text extraction; **Gemini Vision** — PDF images/charts/tables description
- **Better Auth** — optional Google OAuth + sessions
- **Upstash Ratelimit** — optional rate limiting
- **pino** + **@vercel/otel** — structured logs + tracing

## Setup

1. **Install and env**

   ```bash
   npm install
   cp .env.example .env
   ```

2. **Fill `.env`**

   Required:
   - `GOOGLE_GENERATIVE_AI_API_KEY` — Gemini API key
   - `DATABASE_URL` — PostgreSQL connection string
   - `PINECONE_API_KEY` — Pinecone API key
   - `PINECONE_INDEX_NAME` — Pinecone index name (default `nexus-ai`)
   - `UPLOADTHING_TOKEN` — required for the upload UI

   Optional:
   - `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — enable Google sign-in + RBAC
   - `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` — enable distributed rate limiting
   - `COHERE_API_KEY` — enable reranking (better retrieval ordering)
   - `PINECONE_SPARSE_ENABLED=true` — enable sparse+dense hybrid (see Pinecone note below)
   - `RAG_CHUNKING=semantic` — sentence-aware chunking (default is fixed 1000/200)

3. **Database**

   After setting `DATABASE_URL`, create/apply migrations:

   ```bash
   npx prisma migrate dev
   ```

4. **Pinecone index**

   - Create a Pinecone index with **dimension 768** (Gemini `text-embedding-004`).
   - If you enable `PINECONE_SPARSE_ENABLED=true`, your Pinecone setup must support sparse values. (This repo generates a lightweight keyword sparse vector; it’s not full BM25.)

5. **Run**

   ```bash
   npm run dev
   ```

## Project layout

- `src/app/(authed)` — main app UI (server-gated when auth is enabled)
- `src/app/api/chat` — RAG chat API (Gemini + Pinecone + streaming)
- `src/app/api/uploadthing` — UploadThing handler
- `src/app/actions/ingest.ts` — ingestion: file URL/buffer → extract → chunk → embed → upsert Pinecone
- `src/app/actions/documents.ts` — document lifecycle (create+ingest, delete + vector cleanup)
- `src/lib/vector-db/` — Pinecone client + per-user namespace helper
- `src/components/chat/` — chat UI (streaming, Markdown, source badges)
- `src/components/documents/` — document viewer dialog
- `src/components/ui/` — shadcn-style UI primitives (Radix)

## Document ingestion

The ingest pipeline:

1. **Upload** via UploadThing
2. **Create `Document` row** in Postgres (`PROCESSING`)
3. **Extract** text:
   - PDF: `pdf-parse` + Gemini Vision description (prepended to first chunk)
   - DOCX: `mammoth`
   - XLSX: `xlsx` to CSV per sheet
   - TXT/MD: UTF-8
4. **Chunk** (fixed 1000 chars with 200 overlap; optional semantic chunking)
5. **Embed** with Gemini `text-embedding-004` (768 dims)
6. **Upsert** into Pinecone (per-user namespace when auth enabled) with metadata including:
   - `fileName`, `pageNumber`, `text` snippet, `documentId`, `userId` (when available)
7. **Update `Document`** to `COMPLETE` (or `FAILED`)

## Features

- **Source filtering** — query “All documents” or a single document by `fileName`
- **Cited answers** — model is instructed to output `[Source: ..., Page N]` badges
- **Conversation memory** — last 4 messages condensed into a standalone query before retrieval
- **Keyword fallback** — if vector score is low, keyword filtering improves recall
- **Optional sparse hybrid** — `PINECONE_SPARSE_ENABLED=true` adds sparse vectors + sparse query
- **Optional reranking** — set `COHERE_API_KEY` for better ordering of retrieved chunks
- **Chat history** — `ChatSession` + `Message` persisted in Postgres
- **Document management** — list/open/delete documents; delete cleans Pinecone vectors using `documentId`
- **Usage analytics** — `UsageEvent` persisted; audit logs stored in `AuditLog`
- **Rate limiting** — Upstash (if configured) with local fallback

## Docker (self-hosted)

```bash
docker compose up --build
```

Then set the required env vars for the `app` service (Gemini, Pinecone, UploadThing, etc.).

## Public API (API keys)

- Create/list keys (requires auth enabled + signed-in user):
  - `GET /api/api-keys`
  - `POST /api/api-keys` `{ "name": "My key" }` (returns plaintext once)

- Use keys:
  - `POST /api/public/query` with `Authorization: Bearer <apiKey>`
  - `POST /api/public/ingest` with `Authorization: Bearer <apiKey>`

## Notes

- **Next.js security**: project is on `next@15.1.11` which addresses the blocked vulnerable versions on Vercel.