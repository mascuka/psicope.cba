-- El admin ahora puede elegir el color del texto y arrastrar verticalmente
-- el bloque de texto de cada posteo del asistente -- se guardan como
-- elección deliberada (no se pisan solos al "cambiar fondo"/"cambiar
-- texto", que sí siguen resorteando estilo/letra al azar).
alter table public.asistente_ig_posts add column if not exists color_texto text;
alter table public.asistente_ig_posts add column if not exists offset_y_texto integer not null default 0;
