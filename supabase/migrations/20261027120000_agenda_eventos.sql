-- Agenda del panel admin: lo que Brenda anota a mano en un día del
-- calendario (una evaluación, entregar un informe, una reunión con la
-- escuela, vacaciones...). Es aparte de horarios_pacientes, que son los
-- turnos fijos que se repiten cada semana.
--   tipo: paciente | otro
--         (paciente = con paciente, va con el color del paciente; otro = sin paciente, dorado con estrella)
--   hasta: para algo de varios días (ej. vacaciones); null = un solo día.
--   hora / hora_fin: si tiene hora, aparece como bloque en la grilla de la
--         semana (sin hora_fin dura 45 min); sin hora, va en "todo el día".

create table public.agenda_eventos (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  hasta date,
  tipo text not null default 'otro',
  titulo text not null,
  detalle text,
  hora time,
  hora_fin time,
  paciente_id uuid references public.pacientes(id) on delete set null,
  creado_en timestamptz not null default now(),
  constraint agenda_eventos_rango check (hasta is null or hasta >= fecha)
);

create index agenda_eventos_fecha_idx on public.agenda_eventos (fecha);

alter table public.agenda_eventos enable row level security;

create policy "agenda_eventos_admin_todo" on public.agenda_eventos for all
  using (exists (select 1 from public.usuarios u where u.id = auth.uid() and u.rol = 'admin'))
  with check (exists (select 1 from public.usuarios u where u.id = auth.uid() and u.rol = 'admin'));
