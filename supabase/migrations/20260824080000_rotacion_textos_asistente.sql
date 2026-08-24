-- Inclinación/giro de cada texto de la imagen (principal/secundario), en
-- grados -- igual que el color y la posición, cada uno se guarda aparte
-- para poder girarlos de forma independiente.
alter table public.asistente_ig_posts
  add column if not exists rotacion_principal integer not null default 0,
  add column if not exists rotacion_secundaria integer not null default 0;
