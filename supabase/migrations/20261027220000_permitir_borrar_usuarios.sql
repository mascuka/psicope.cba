-- Borrar un usuario desde el panel de Supabase (Authentication -> Users)
-- fallaba si tenía alguna compra o solicitud de turno: esas tablas apuntan
-- a auth.users sin decir qué hacer al borrarlo, y Postgres lo bloquea.
-- Con "on delete set null" la compra / solicitud queda (Brenda no pierde
-- el registro de ventas ni de turnos, con el email y nombre que ya tienen
-- guardados), solo se desvincula de la cuenta borrada.
alter table public.compras drop constraint if exists compras_usuario_id_fkey;
alter table public.compras
  add constraint compras_usuario_id_fkey foreign key (usuario_id) references auth.users(id) on delete set null;

alter table public.solicitudes_turno drop constraint if exists solicitudes_turno_creado_por_fkey;
alter table public.solicitudes_turno
  add constraint solicitudes_turno_creado_por_fkey foreign key (creado_por) references auth.users(id) on delete set null;

alter table public.turnos drop constraint if exists turnos_creado_por_fkey;
alter table public.turnos
  add constraint turnos_creado_por_fkey foreign key (creado_por) references auth.users(id) on delete set null;

-- El perfil (tabla usuarios) no estaba atado a la cuenta: al borrarla
-- quedaba suelto. Ahora se borra con ella. "not valid" para no fallar si ya
-- quedó algún perfil suelto de antes (solo aplica a los borrados nuevos).
alter table public.usuarios drop constraint if exists usuarios_id_fkey;
alter table public.usuarios
  add constraint usuarios_id_fkey foreign key (id) references auth.users(id) on delete cascade not valid;
