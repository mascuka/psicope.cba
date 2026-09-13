-- "Lugares de trabajo" (ej: Centro X, Centro Y): instituciones donde
-- Brenda trabaja y le pagan un monto acordado por los pacientes que ELLAS
-- le asignan -- no tiene nada que ver con "sedes" (que es el mapa público
-- para pedir turno como particular). Un paciente puede venir de un lugar
-- de trabajo en vez de tener obra social o ser particular: ella igual lo
-- carga en su lista para organizarse, aunque no sea quien lo consiguió.

create table public.lugares_trabajo (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  monto numeric,
  dias_pago integer default 30,
  creado_en timestamptz not null default now()
);

alter table public.pacientes add column if not exists lugar_trabajo_id uuid references public.lugares_trabajo(id) on delete set null;

alter table public.lugares_trabajo enable row level security;

create policy "lugares_trabajo_admin_todo" on public.lugares_trabajo for all
  using (exists (select 1 from public.usuarios u where u.id = auth.uid() and u.rol = 'admin'))
  with check (exists (select 1 from public.usuarios u where u.id = auth.uid() and u.rol = 'admin'));
