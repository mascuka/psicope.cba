alter table public.compras
  add column if not exists external_reference text;

create index if not exists compras_external_reference_idx on public.compras (external_reference);
