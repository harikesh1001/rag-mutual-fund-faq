alter table public.documents
  add column if not exists document_type text not null default 'unknown',
  add column if not exists http_status integer,
  add column if not exists extraction_status text not null default 'pending',
  add column if not exists error_message text;