-- crear_perfil_usuario podía fallar en silencio: "usuarios.email" es único,
-- y si quedaba el perfil suelto de una cuenta borrada antes de que existiera
-- el "on delete cascade" (ver 20261027220000) con el mismo email, el perfil
-- nuevo no se guardaba. La cuenta quedaba sin nombre ni email en Mi Perfil.
-- Ahora, antes de crear el perfil, se borra ese perfil suelto (solo si su
-- cuenta ya no existe).
create or replace function public.crear_perfil_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    delete from public.usuarios p
    where lower(p.email) = lower(new.email)
      and p.id <> new.id
      and not exists (select 1 from auth.users u where u.id = p.id);

    insert into public.usuarios (id, email, nombre, fecha_nacimiento, pais, telefono, rol)
    values (
      new.id,
      new.email,
      nullif(new.raw_user_meta_data->>'nombre', ''),
      nullif(new.raw_user_meta_data->>'fecha_nacimiento', '')::date,
      nullif(new.raw_user_meta_data->>'pais', ''),
      nullif(new.raw_user_meta_data->>'telefono', ''),
      'normal'
    )
    on conflict (id) do nothing;
  exception when others then
    -- Un dato raro no puede impedir que se cree la cuenta: queda sin perfil
    -- y se avisa en el log.
    raise warning 'crear_perfil_usuario: %', sqlerrm;
  end;
  return new;
end;
$$;

-- Las cuentas que quedaron sin perfil (entre ellas, la de prueba de
-- Santiago creada el 27/10).
insert into public.usuarios (id, email, nombre, fecha_nacimiento, pais, telefono, rol)
select
  u.id,
  u.email,
  nullif(u.raw_user_meta_data->>'nombre', ''),
  case when u.raw_user_meta_data->>'fecha_nacimiento' ~ '^\d{4}-\d{2}-\d{2}$'
       then (u.raw_user_meta_data->>'fecha_nacimiento')::date end,
  nullif(u.raw_user_meta_data->>'pais', ''),
  nullif(u.raw_user_meta_data->>'telefono', ''),
  'normal'
from auth.users u
where not exists (select 1 from public.usuarios p where p.id = u.id)
  and not exists (select 1 from public.usuarios p where lower(p.email) = lower(u.email));
