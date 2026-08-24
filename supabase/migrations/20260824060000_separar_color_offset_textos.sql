-- Separa el color y la posición de los dos textos de la imagen
-- (principal/secundario) en columnas independientes: antes había una sola
-- de cada, ahora se puede editar/arrastrar cada texto por separado.
alter table public.asistente_ig_posts
  add column if not exists color_texto_principal text,
  add column if not exists color_texto_secundario text,
  add column if not exists offset_y_principal integer not null default 0,
  add column if not exists offset_y_secundario integer not null default 0;

update public.asistente_ig_posts
set color_texto_principal = coalesce(color_texto_principal, color_texto),
    color_texto_secundario = coalesce(color_texto_secundario, color_texto),
    offset_y_principal = case when offset_y_principal = 0 then coalesce(offset_y_texto, 0) else offset_y_principal end,
    offset_y_secundario = case when offset_y_secundario = 0 then coalesce(offset_y_texto, 0) else offset_y_secundario end
where color_texto is not null or offset_y_texto is not null;

alter table public.asistente_ig_posts
  drop column if exists color_texto,
  drop column if exists offset_y_texto;
