create extension if not exists vector;
create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'ingest_status') then
    create type public.ingest_status as enum ('PENDING', 'PROCESSING', 'COMPLETE', 'FAILED');
  end if;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  mime_type text not null,
  file_size bigint not null check (file_size > 0),
  chunks_count int not null default 0,
  status public.ingest_status not null default 'PENDING',
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  content_tsv tsvector generated always as (to_tsvector('english', content)) stored,
  embedding vector(768) not null,
  page_number int,
  token_count int,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, chunk_index)
);

create index if not exists documents_user_idx on public.documents(user_id, created_at desc);
create index if not exists document_chunks_user_idx on public.document_chunks(user_id, created_at desc);
create index if not exists document_chunks_doc_idx on public.document_chunks(document_id, chunk_index);
create index if not exists document_chunks_content_tsv_idx on public.document_chunks using gin(content_tsv);
create index if not exists document_chunks_embedding_idx on public.document_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists chat_sessions_user_idx on public.chat_sessions(user_id, updated_at desc);
create index if not exists chat_messages_session_idx on public.chat_messages(session_id, created_at asc);

create table if not exists public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid references public.chat_sessions(id) on delete set null,
  type text not null,
  prompt_tokens int,
  completion_tokens int,
  total_tokens int,
  retrieval_ms int,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists usage_events_user_idx on public.usage_events(user_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at before update on public.documents for each row execute function public.set_updated_at();

drop trigger if exists document_chunks_set_updated_at on public.document_chunks;
create trigger document_chunks_set_updated_at before update on public.document_chunks for each row execute function public.set_updated_at();

drop trigger if exists chat_sessions_set_updated_at on public.chat_sessions;
create trigger chat_sessions_set_updated_at before update on public.chat_sessions for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;
alter table public.usage_events enable row level security;

create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy "profiles_insert_own"
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "documents_select_own"
on public.documents
for select
to authenticated
using (user_id = auth.uid());

create policy "documents_insert_own"
on public.documents
for insert
to authenticated
with check (user_id = auth.uid());

create policy "documents_update_own"
on public.documents
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "documents_delete_own"
on public.documents
for delete
to authenticated
using (user_id = auth.uid());

create policy "document_chunks_select_own"
on public.document_chunks
for select
to authenticated
using (user_id = auth.uid());

create policy "document_chunks_insert_own"
on public.document_chunks
for insert
to authenticated
with check (user_id = auth.uid());

create policy "document_chunks_update_own"
on public.document_chunks
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "document_chunks_delete_own"
on public.document_chunks
for delete
to authenticated
using (user_id = auth.uid());

create policy "chat_sessions_all_own"
on public.chat_sessions
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "chat_messages_all_own"
on public.chat_messages
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create policy "usage_events_all_own"
on public.usage_events
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents-private',
  'documents-private',
  false,
  52428800,
  array['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']
)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

create policy "storage_select_own"
on storage.objects
for select
to authenticated
using (bucket_id = 'documents-private' and split_part(name, '/', 1) = auth.uid()::text);

create policy "storage_insert_own"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'documents-private' and split_part(name, '/', 1) = auth.uid()::text);

create policy "storage_delete_own"
on storage.objects
for delete
to authenticated
using (bucket_id = 'documents-private' and split_part(name, '/', 1) = auth.uid()::text);

create or replace function public.match_document_chunks(
  query_embedding vector(768),
  match_count int default 5,
  filter_document_id uuid default null
)
returns table (
  chunk_id uuid,
  document_id uuid,
  file_name text,
  content text,
  page_number int,
  metadata jsonb,
  score float
)
language sql
stable
security invoker
as $$
  select
    dc.id as chunk_id,
    dc.document_id,
    d.file_name,
    dc.content,
    dc.page_number,
    dc.metadata,
    1 - (dc.embedding <=> query_embedding) as score
  from public.document_chunks dc
  join public.documents d on d.id = dc.document_id
  where dc.user_id = auth.uid()
    and (filter_document_id is null or dc.document_id = filter_document_id)
  order by dc.embedding <=> query_embedding
  limit greatest(1, least(match_count, 20));
$$;
