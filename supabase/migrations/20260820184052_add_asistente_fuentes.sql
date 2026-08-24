alter table public.asistente_ig_posts
  add column if not exists fuente_wikipedia jsonb,
  add column if not exists referencias_generales text[];
