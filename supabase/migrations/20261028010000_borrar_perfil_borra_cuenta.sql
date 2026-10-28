-- Borrar una fila de "usuarios" (por ejemplo desde el Table Editor de
-- Supabase) solo borraba el perfil: la cuenta (email y contraseña, en
-- auth.users) seguía viva, se podía entrar igual y quedaba "Usuario" sin
-- nombre ni email. Ahora borrar el perfil borra la cuenta completa, igual
-- que borrarla desde Authentication -> Users.
--
-- pg_trigger_depth() = 1: solo cuando el perfil se borra directamente. Si
-- el borrado viene de la cuenta (cascade de usuarios_id_fkey), la cuenta ya
-- se está borrando y volver a borrarla daría error.
create or replace function public.borrar_cuenta_al_borrar_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if pg_trigger_depth() = 1 then
    delete from auth.users where id = old.id;
  end if;
  return old;
end;
$$;

drop trigger if exists borrar_cuenta_al_borrar_perfil on public.usuarios;
create trigger borrar_cuenta_al_borrar_perfil
  after delete on public.usuarios
  for each row execute function public.borrar_cuenta_al_borrar_perfil();
