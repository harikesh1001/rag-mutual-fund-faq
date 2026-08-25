create extension if not exists vector with schema extensions;

create table if not exists public.schemes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  amc text not null,
  aliases text[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint schemes_name_amc_unique unique (name, amc)
);

create table if not exists public.sources (
  id uuid primary key default gen_random_uuid(),
  url text not null unique,
  title text not null,
  domain text not null,
  source_type text not null,
  scheme_id uuid references public.schemes(id) on delete set null,
  publication_date date,
  last_fetched_at timestamptz,
  checksum text,
  status text not null,
  created_at timestamptz not null default now(),
  constraint sources_domain_allowed check (domain in ('sbimf.com', 'sebi.gov.in', 'amfiindia.com')),
  constraint sources_url_allowed check (
    url ~ '^https://(www\.)?sbimf\.com(/[^ ]*)?$'
    or url ~ '^https://(www\.)?sebi\.gov\.in(/[^ ]*)?$'
    or url ~ '^https://(www\.)?amfiindia\.com(/[^ ]*)?$'
  )
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.sources(id) on delete cascade,
  content text not null,
  content_hash text not null,
  version integer not null,
  fetched_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint documents_version_positive check (version > 0),
  constraint documents_source_version_unique unique (source_id, version)
);

create table if not exists public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  scheme_id uuid references public.schemes(id) on delete set null,
  topic text,
  source_url text not null,
  publication_date date,
  embedding extensions.vector(768),
  created_at timestamptz not null default now(),
  constraint document_chunks_index_nonnegative check (chunk_index >= 0),
  constraint document_chunks_document_index_unique unique (document_id, chunk_index)
);

create index if not exists sources_scheme_id_idx on public.sources(scheme_id);
create index if not exists documents_source_id_idx on public.documents(source_id);
create index if not exists document_chunks_document_id_idx on public.document_chunks(document_id);
create index if not exists document_chunks_scheme_id_idx on public.document_chunks(scheme_id);

alter table public.schemes enable row level security;
alter table public.sources enable row level security;
alter table public.documents enable row level security;
alter table public.document_chunks enable row level security;

create policy "Service role manages schemes"
  on public.schemes for all to service_role using (true) with check (true);
create policy "Service role manages sources"
  on public.sources for all to service_role using (true) with check (true);
create policy "Service role manages documents"
  on public.documents for all to service_role using (true) with check (true);
create policy "Service role manages document chunks"
  on public.document_chunks for all to service_role using (true) with check (true);

insert into public.schemes (name, amc)
values
  ('SBI Large Cap Fund', 'SBI Mutual Fund'),
  ('SBI Flexicap Fund', 'SBI Mutual Fund'),
  ('SBI Small Cap Fund', 'SBI Mutual Fund'),
  ('SBI ELSS Tax Saver Fund', 'SBI Mutual Fund')
on conflict do nothing;