-- Panel de Finanzas del consultorio: registro de cobros a pacientes
-- (ingresos) y gastos del negocio (monotributo, alquiler, insumos, etc.),
-- más un flag para poder pausar/reactivar un paciente sin borrarlo (así
-- no se pierde su historial de cobros al "sacarlo" de la lista activa).

alter table public.pacientes add column if not exists activo boolean not null default true;

create table public.cobros (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid references public.pacientes(id) on delete set null,
  concepto text,
  monto numeric not null,
  fecha date not null default current_date,
  notas text,
  creado_en timestamptz not null default now()
);

create table public.gastos (
  id uuid primary key default gen_random_uuid(),
  concepto text not null,
  categoria text not null default 'otro',
  monto numeric not null,
  fecha date not null default current_date,
  recurrente boolean not null default false,
  frecuencia text,
  notas text,
  creado_en timestamptz not null default now()
);

-- Mismo criterio que el resto de las tablas del consultorio (pacientes,
-- paciente_notas, horarios_pacientes): son datos privados del negocio,
-- solo el admin (Brenda) puede leerlos o tocarlos.
alter table public.cobros enable row level security;
alter table public.gastos enable row level security;

create policy "cobros_admin_todo" on public.cobros for all
  using (exists (select 1 from public.usuarios u where u.id = auth.uid() and u.rol = 'admin'))
  with check (exists (select 1 from public.usuarios u where u.id = auth.uid() and u.rol = 'admin'));

create policy "gastos_admin_todo" on public.gastos for all
  using (exists (select 1 from public.usuarios u where u.id = auth.uid() and u.rol = 'admin'))
  with check (exists (select 1 from public.usuarios u where u.id = auth.uid() and u.rol = 'admin'));

create index cobros_fecha_idx on public.cobros (fecha);
create index cobros_paciente_idx on public.cobros (paciente_id);
create index gastos_fecha_idx on public.gastos (fecha);
