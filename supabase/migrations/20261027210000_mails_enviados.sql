-- Registro de cada mail que sale por el Gmail de Brenda (ver
-- functions/_shared/gmail.ts), para poner un tope de 100 por día: cualquiera
-- puede pedir un material gratis para cualquier dirección, y si alguien
-- abusa, Gmail le puede bloquear la cuenta a Brenda por spam.
create table if not exists public.mails_enviados (
  id bigint generated always as identity primary key,
  destinatario text not null,
  creado_en timestamptz not null default now()
);

create index if not exists mails_enviados_creado_en_idx on public.mails_enviados (creado_en);

-- Solo la usan las funciones del servidor (service_role salta RLS): RLS sin
-- políticas la deja cerrada para cualquier otro.
alter table public.mails_enviados enable row level security;
