alter table public.compras
  add column if not exists email_enviado boolean not null default false,
  add column if not exists email_error text;
