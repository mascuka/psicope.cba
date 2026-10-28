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

-- Excepción: mascuka410@gmail.com es la cuenta con la que Santiago prueba
-- registros y compras. Al borrarla se borran también sus compras,
-- solicitudes y turnos (de la cuenta o hechos como invitado con ese email),
-- para que no queden ventas ni turnos de prueba en el panel de Brenda.
create or replace function public.borrar_datos_cuenta_de_prueba()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(old.email) = 'mascuka410@gmail.com' then
    delete from public.compras where usuario_id = old.id or lower(email_usuario) = lower(old.email);
    delete from public.solicitudes_turno where creado_por = old.id or lower(email) = lower(old.email);
    delete from public.turnos where creado_por = old.id or lower(email_contacto) = lower(old.email);
  end if;
  return old;
end;
$$;

drop trigger if exists borrar_datos_cuenta_de_prueba on auth.users;
create trigger borrar_datos_cuenta_de_prueba
  before delete on auth.users
  for each row execute function public.borrar_datos_cuenta_de_prueba();
