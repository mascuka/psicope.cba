-- "Usuarios pueden editar su propio perfil" (ver 20260824000512) deja
-- actualizar CUALQUIER columna de la fila propia, rol incluido: un usuario
-- registrado podía mandar desde el navegador update usuarios set
-- rol = 'admin' y pasar a ver pacientes, notas, archivos y finanzas.
-- Lo mismo al registrarse: el insert lo arma el navegador
-- (RegistroForm.jsx), así que podía llegar con rol = 'admin'.
--
-- El email tiene un problema parecido: mp-webhook asocia cada compra al
-- usuario cuyo usuarios.email coincide con el del comprador, así que
-- alguien podía poner el email de otra persona en su perfil y quedarse con
-- sus compras futuras (y bajarlas desde "Mis Compras").
--
-- Este trigger ignora esos dos campos cuando el pedido viene del navegador
-- (anon / authenticated). El servidor (service_role) y el SQL Editor no
-- pasan por acá, así que nombrar un admin se sigue haciendo como siempre.
create or replace function public.proteger_campos_usuario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.rol := 'normal';
    new.email := coalesce((select u.email from auth.users u where u.id = new.id), new.email);
  else
    new.rol := old.rol;
    new.email := old.email;
  end if;
  return new;
end;
$$;

drop trigger if exists proteger_campos_usuario on public.usuarios;
create trigger proteger_campos_usuario
  before insert or update on public.usuarios
  for each row execute function public.proteger_campos_usuario();
