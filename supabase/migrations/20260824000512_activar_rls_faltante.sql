-- Activa Row Level Security (RLS) en las tablas que quedaron sin activar.
-- "materiales" y "usuarios" YA tenían políticas bien armadas -- nunca se
-- prendió el interruptor de RLS en la tabla, así que esas políticas nunca
-- se aplicaron y quedaron completamente abiertas para cualquiera con la
-- clave pública del sitio (pública por diseño -- lo que tiene que estar
-- cerrado es la base, no la clave). Confirmado en vivo antes de este fix:
-- se podía leer toda la tabla de compras y usuarios (nombre, email,
-- teléfono, fecha de nacimiento, quién es admin) sin ningún login.
--
-- El resto de las tablas del consultorio (pacientes, paciente_notas,
-- turnos, etc.) YA tenían RLS activado con políticas admin-only o de
-- lectura pública según corresponde -- no se tocan acá.

-- materiales y usuarios: las políticas ya estaban bien, solo faltaba
-- activar RLS.
alter table public.materiales enable row level security;
alter table public.usuarios enable row level security;

-- usuarios: faltaba la política para que cada quien edite SU PROPIO
-- perfil (Perfil.jsx hace un update directo) -- sin esto, al activar
-- RLS esa función se hubiera roto.
create policy "Usuarios pueden editar su propio perfil" on public.usuarios
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- compras: sin políticas todavía -- se arman desde cero.
alter table public.compras enable row level security;

-- Un usuario logueado ve sus propias compras ("Mis Compras").
create policy "compras_select_propio" on public.compras
  for select using (auth.uid() = usuario_id);

-- El admin puede ver todas.
create policy "compras_select_admin" on public.compras
  for select using (exists (select 1 from public.usuarios u where u.id = auth.uid() and u.rol = 'admin'));

-- El insert directo desde el navegador (sin pasar por Mercado Pago) lo usan
-- SOLO dos casos: el admin acreditándose un material para probar, y un
-- material gratuito. Siempre atribuido a uno mismo, y el prefijo del
-- payment_id ("ADMIN_"/"GRATIS_") se valida contra datos reales (si sos
-- realmente admin, o si el material realmente cuesta $0) -- no alcanza con
-- que el navegador mande el prefijo correcto, porque eso lo controla quien
-- pide la compra.
create policy "compras_insert_propio_validado" on public.compras
  for insert with check (
    auth.uid() = usuario_id
    and (
      (payment_id like 'ADMIN\_%' and exists (select 1 from public.usuarios u where u.id = auth.uid() and u.rol = 'admin'))
      or
      (payment_id like 'GRATIS\_%' and exists (select 1 from public.materiales m where m.id = material_id and m.precio = 0))
    )
  );

-- MisCompras.jsx tiene un botón admin-only para "quitar una compra de
-- prueba" (borrarla y poder volver a probar el flujo).
create policy "compras_delete_admin" on public.compras
  for delete using (exists (select 1 from public.usuarios u where u.id = auth.uid() and u.rol = 'admin'));

-- qr_reserva: mecanismo interno (fila única, cola del QR compartido) --
-- solo lo tocan las funciones del servidor (clave service_role, que
-- siempre salta RLS). Activar RLS sin políticas lo deja cerrado para
-- cualquier otro.
alter table public.qr_reserva enable row level security;

-- _maintenance_ping: tabla interna sin uso conocido desde el sitio --
-- mismo criterio, cerrada por completo salvo service_role.
alter table public._maintenance_ping enable row level security;

-- Contenido de texto de las distintas páginas (home, navbar, mis compras,
-- web general): lectura pública (es contenido del sitio en sí), edición
-- solo admin -- mismo patrón que ya usaban "materiales"/"psicopedagogiando".
alter table public.contenido_home enable row level security;
create policy "contenido_home_lectura_publica" on public.contenido_home for select using (true);
create policy "contenido_home_admin_todo" on public.contenido_home for all
  using (exists (select 1 from public.usuarios u where u.id = auth.uid() and u.rol = 'admin'))
  with check (exists (select 1 from public.usuarios u where u.id = auth.uid() and u.rol = 'admin'));

alter table public.contenido_web enable row level security;
create policy "contenido_web_lectura_publica" on public.contenido_web for select using (true);
create policy "contenido_web_admin_todo" on public.contenido_web for all
  using (exists (select 1 from public.usuarios u where u.id = auth.uid() and u.rol = 'admin'))
  with check (exists (select 1 from public.usuarios u where u.id = auth.uid() and u.rol = 'admin'));

alter table public.contenido_mis_compras enable row level security;
create policy "contenido_mis_compras_lectura_publica" on public.contenido_mis_compras for select using (true);
create policy "contenido_mis_compras_admin_todo" on public.contenido_mis_compras for all
  using (exists (select 1 from public.usuarios u where u.id = auth.uid() and u.rol = 'admin'))
  with check (exists (select 1 from public.usuarios u where u.id = auth.uid() and u.rol = 'admin'));

alter table public.contenido_navbar enable row level security;
create policy "contenido_navbar_lectura_publica" on public.contenido_navbar for select using (true);
create policy "contenido_navbar_admin_todo" on public.contenido_navbar for all
  using (exists (select 1 from public.usuarios u where u.id = auth.uid() and u.rol = 'admin'))
  with check (exists (select 1 from public.usuarios u where u.id = auth.uid() and u.rol = 'admin'));
