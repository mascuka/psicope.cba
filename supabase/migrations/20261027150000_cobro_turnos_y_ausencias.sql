-- Cómo se cobra cada turno fijo y qué pasó en un día puntual.
--
-- 1. En horarios_pacientes, la forma de cobro del turno (reemplaza al viejo
--    "cobra a los X días" del turno):
--      forma_cobro = 'efectivo'    -> se cobra `monto` el mismo día de la sesión.
--      forma_cobro = 'obra_social' -> paga `obra_social_id`: su precio_hora, a
--                                     los dias_pago días de la sesión.
--    null = turno viejo, todavía sin forma de cobro elegida.
--
-- 2. horarios_excepciones: un día puntual de un turno fijo que no fue como
--    siempre, sin tocar las demás semanas.
--      estado = 'cancelado' -> ese día no hay sesión (se sacó de la semana).
--      estado = 'falto'     -> el consultante faltó; `cobra` dice si igual se cobra.

alter table public.horarios_pacientes
  add column if not exists forma_cobro text check (forma_cobro in ('efectivo', 'obra_social')),
  add column if not exists monto numeric,
  add column if not exists obra_social_id uuid references public.obras_sociales(id) on delete set null;

create table public.horarios_excepciones (
  id uuid primary key default gen_random_uuid(),
  horario_id uuid not null references public.horarios_pacientes(id) on delete cascade,
  fecha date not null,
  estado text not null check (estado in ('cancelado', 'falto')),
  cobra boolean not null default false,
  creado_en timestamptz not null default now(),
  unique (horario_id, fecha)
);

create index horarios_excepciones_fecha_idx on public.horarios_excepciones (fecha);

alter table public.horarios_excepciones enable row level security;

create policy "horarios_excepciones_admin_todo" on public.horarios_excepciones for all
  using (exists (select 1 from public.usuarios u where u.id = auth.uid() and u.rol = 'admin'))
  with check (exists (select 1 from public.usuarios u where u.id = auth.uid() and u.rol = 'admin'));
