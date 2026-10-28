-- El registro guardaba el perfil (tabla usuarios) desde el navegador, justo
-- después de crear la cuenta. Pero hasta confirmar el email no hay sesión,
-- y el insert pedía devolver la fila (.select()), cosa que RLS solo deja a
-- la propia cuenta logueada: "new row violates row-level security policy
-- for table usuarios". Nadie podía registrarse.
-- Ahora el perfil lo crea la base sola al crearse la cuenta, con los datos
-- del formulario que viajan como metadata (ver registrar-usuario).
create or replace function public.crear_perfil_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
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
    -- Un dato raro (por ejemplo una fecha mal escrita) no puede impedir que
    -- se cree la cuenta: queda sin perfil y se avisa en el log.
    raise warning 'crear_perfil_usuario: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists crear_perfil_usuario on auth.users;
create trigger crear_perfil_usuario
  after insert on auth.users
  for each row execute function public.crear_perfil_usuario();

-- Las cuentas que quedaron creadas sin perfil por ese error.
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
where not exists (select 1 from public.usuarios p where p.id = u.id);

-- Ya nadie inserta perfiles desde el navegador: se cierra el insert público.
drop policy if exists "Permitir registro publico" on public.usuarios;
