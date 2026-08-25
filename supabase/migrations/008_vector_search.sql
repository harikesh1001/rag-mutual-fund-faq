create or replace function public.match_document_chunks(
  query_embedding extensions.vector(768),
  match_count integer default 5,
  filter_scheme_id uuid default null
)
returns table (
  id uuid,
  document_id uuid,
  chunk_index integer,
  content text,
  scheme_id uuid,
  topic text,
  source_url text,
  publication_date date,
  source_id uuid,
  source_title text,
  amc text,
  document_type text,
  chunk_hash text,
  similarity double precision
)
language sql
stable
as $$
  select
    dc.id,
    dc.document_id,
    dc.chunk_index,
    dc.content,
    dc.scheme_id,
    dc.topic,
    dc.source_url,
    dc.publication_date,
    dc.source_id,
    dc.source_title,
    dc.amc,
    dc.document_type,
    dc.chunk_hash,
    1 - (dc.embedding <=> query_embedding) as similarity
  from public.document_chunks dc
  where dc.embedding is not null
    and (
      filter_scheme_id is null
      or dc.scheme_id = filter_scheme_id
    )
  order by dc.embedding <=> query_embedding
  limit greatest(match_count, 1);
$$;