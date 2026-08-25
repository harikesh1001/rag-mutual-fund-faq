alter table public.document_chunks
  add column if not exists source_id uuid references public.sources(id) on delete cascade,
  add column if not exists source_title text not null default '',
  add column if not exists amc text not null default 'SBI Mutual Fund',
  add column if not exists document_type text not null default 'unknown',
  add column if not exists chunk_hash text not null default '';

create unique index if not exists document_chunks_document_index_hash_idx
  on public.document_chunks(document_id, chunk_index, chunk_hash);