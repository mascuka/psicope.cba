-- Endurece la política de INSERT en "compras": el caso "GRATIS" ya
-- validaba que el material sea realmente gratis, pero no que el monto
-- cargado también lo sea -- alguien manejando la petición a mano (no
-- desde la web normal) podía insertar un "precio_pagado" inventado en un
-- registro que de todas formas nunca costó nada real. No permite comprar
-- nada pago gratis (eso ya estaba cerrado), pero sí ensucia el reporte de
-- ventas -- lo cierra también.
drop policy if exists "compras_insert_propio_validado" on public.compras;
create policy "compras_insert_propio_validado" on public.compras
  for insert with check (
    auth.uid() = usuario_id
    and (
      (payment_id like 'ADMIN\_%' and exists (select 1 from public.usuarios u where u.id = auth.uid() and u.rol = 'admin'))
      or
      (payment_id like 'GRATIS\_%' and precio_pagado = 0 and exists (select 1 from public.materiales m where m.id = material_id and m.precio = 0))
    )
  );

-- Tabla que faltaba: Psicopedagogiando.jsx guarda/lee el título y la frase
-- del encabezado de esa página en una tabla "configuraciones" que nunca
-- llegó a crearse -- la función de guardar fallaba en silencio (no
-- revisaba el error) y el encabezado quedaba siempre con el texto por
-- defecto, sin avisar. Mismo patrón que "contenido_home": clave/valor,
-- lectura pública, edición solo admin.
create table if not exists public.configuraciones (
  clave text primary key,
  valor jsonb not null,
  actualizado_en timestamptz not null default now()
);

alter table public.configuraciones enable row level security;
create policy "configuraciones_lectura_publica" on public.configuraciones for select using (true);
create policy "configuraciones_admin_todo" on public.configuraciones for all
  using (exists (select 1 from public.usuarios u where u.id = auth.uid() and u.rol = 'admin'))
  with check (exists (select 1 from public.usuarios u where u.id = auth.uid() and u.rol = 'admin'));

insert into public.configuraciones (clave, valor) values
  ('psico_header', '{"titulo": "Psicopedagogiando", "frase": "Un espacio para aprender, compartir y crecer juntos."}'::jsonb)
on conflict (clave) do nothing;
