-- Orden manual (arrastrar y soltar) de las tarjetas de Psicopedagogiando,
-- independiente de la fecha de creación. Se inicializa con el orden que ya
-- tenían (más nuevo primero, igual que el "order by created_at desc" que
-- usaba la página hasta ahora) para no reordenar nada de golpe al aplicar
-- esta migración -- de acá en más, cada post nuevo entra con un número más
-- chico que el mínimo existente (ver Psicopedagogiando.jsx), así sigue
-- apareciendo primero salvo que el admin lo mueva a mano.
alter table public.psicopedagogiando add column if not exists orden integer;

with numerados as (
  select id, row_number() over (order by created_at desc) - 1 as rn
  from public.psicopedagogiando
)
update public.psicopedagogiando p
set orden = n.rn
from numerados n
where p.id = n.id and p.orden is null;

alter table public.psicopedagogiando alter column orden set default 0;
alter table public.psicopedagogiando alter column orden set not null;
