-- El buscador de Psicopedagogiando solo miraba "titulo", nunca "contenido"
-- ni el texto que el asistente de IA dibuja arriba de la imagen (principal/
-- secundario) -- ese texto nunca se guardaba en esta tabla, así que aunque
-- se viera en la imagen, era imposible encontrarlo buscando esas palabras.
alter table public.psicopedagogiando
  add column if not exists texto_imagen_principal text,
  add column if not exists texto_imagen_secundario text;

-- Backfill para lo ya publicado: "asistente_ig_posts" guarda el borrador
-- original (no se borra al publicar, solo se marca estado='publicado'), así
-- que se puede recuperar el texto de imagen de lo ya publicado matcheando
-- por título + contenido exactos (evita falsos positivos entre posteos
-- distintos).
update public.psicopedagogiando p
set texto_imagen_principal = a.texto_imagen_principal,
    texto_imagen_secundario = a.texto_imagen_secundario
from public.asistente_ig_posts a
where p.tipo = 'imagen_ia'
  and p.texto_imagen_principal is null
  and a.estado = 'publicado'
  and a.titulo = p.titulo
  and a.contenido = p.contenido;
