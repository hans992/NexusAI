# Nexus AI

Private, multi-tenant RAG assistant for internal company knowledge.

## Stack

- **Frontend/App Layer:** Next.js App Router, TypeScript, Tailwind, shadcn-style UI
- **Auth + Data + Storage:** Supabase Auth, Postgres, pgvector, private storage bucket
- **AI:** Gemini embeddings (`text-embedding-004`) + Gemini generation (`gemini-2.5-flash`)
- **Parsers:** `pdf-parse` (PDF), `mammoth` (DOCX), UTF-8 text for TXT
- **Protection:** RLS, per-user API rate limits, private object storage

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy env file:

   ```bash
   cp .env.example .env
   ```

3. Fill required vars in `.env`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `GOOGLE_GENERATIVE_AI_API_KEY`
   - `NEXT_PUBLIC_APP_URL`

4. Apply SQL migration in Supabase:
   - `supabase/migrations/202604010001_init_nexus_rag.sql`

5. Run the app:

   ```bash
   npm run dev
   ```

## Architecture

- `src/server/rag/ingestion` — file extraction and chunking
- `src/server/rag/indexing` — embeddings + `document_chunks` indexing
- `src/server/rag/retrieval` — vector retrieval through SQL RPC
- `src/server/rag/generation` — grounded answer generation with source badges
- `src/server/storage` — private bucket upload/download/delete/signed URLs
- `src/server/auth` and `src/server/db` — Supabase session + client/repository boundaries
- `src/app/api/rag/*` — thin API controllers

## Security Model

- No public file bucket; documents are stored in `documents-private`.
- RLS enforces per-user access in `documents`, `document_chunks`, chats, and usage tables.
- Query retrieval is constrained to `auth.uid()` in SQL (`match_document_chunks`).
- Only retrieved top-k chunks are sent to the LLM (never full documents).