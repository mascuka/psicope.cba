-- El bucket "materiales-privados" (los PDFs pagos) y "paciente-archivos"
-- (archivos clínicos de pacientes) están marcados como NO públicos a nivel
-- de bucket -- pero había 3 políticas de storage.objects heredadas de un
-- asistente/plantilla, con `qual = true` y SIN ningún filtro de
-- `bucket_id`, que le daban lectura a CUALQUIERA (anon incluido) sobre
-- TODOS los buckets, público o no. Confirmado en vivo antes de este fix:
-- se podía listar y descargar directo cualquier PDF pago, sin pagar ni
-- tener sesión.
--
-- Los buckets que sí deben ser públicos (avatars, imagenes-web,
-- materiales-didacticos) siguen funcionando igual: están marcados
-- "public" a nivel de bucket, lo que habilita la ruta
-- /storage/v1/object/public/... sin pasar por estas políticas -- que es
-- justo la URL que ya devuelve getPublicUrl() en el código.
drop policy if exists "Acceso publico lectura cssxrc_0" on storage.objects;
drop policy if exists "Permitir lectura publica cssxrc_0" on storage.objects;
drop policy if exists "imagenes-web cssxrc_1" on storage.objects;

-- Con esas políticas afuera, "materiales-privados" queda accesible solo
-- para admin (por las políticas que ya existían: "Admin ve archivos",
-- "Admin gestiona bucket privado") y para el servidor (las funciones usan
-- la clave de service_role, que siempre salta RLS). Falta un caso legítimo
-- más: un comprador logueado bajándose de nuevo, desde "Mis Compras", un
-- material que YA compró -- esa pantalla genera el link firmado con la
-- sesión del propio usuario, no con una función del servidor.
create policy "compradores_acceden_su_material" on storage.objects
  for select using (
    bucket_id = 'materiales-privados'
    and exists (
      select 1 from public.materiales m
      join public.compras c on c.material_id = m.id
      where m.archivo_url = storage.objects.name
        and c.usuario_id = auth.uid()
        and c.status = 'approved'
    )
  );
