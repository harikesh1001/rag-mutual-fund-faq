alter table public.sources
  add column if not exists registry_id integer,
  add column if not exists scope text not null default 'SBI Mutual Fund',
  add column if not exists information_covered text not null default '',
  add column if not exists purpose text not null default '';

create unique index if not exists sources_registry_id_idx
  on public.sources(registry_id)
  where registry_id is not null;