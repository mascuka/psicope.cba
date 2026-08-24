-- Reserva del ÚNICO QR de cobro compartido: como el QR de Mercado Pago es
-- un solo punto de venta (no se puede tener uno distinto por visitante al
-- instante), esta fila coordina que solo una persona a la vez lo esté
-- usando -- el resto espera su turno en la web mientras esta fila sigue
-- "ocupada".
create table if not exists public.qr_reserva (
  id int primary key,
  ocupado boolean not null default false,
  titular text,
  material_id bigint,
  email text,
  expira_en timestamptz,
  actualizado_en timestamptz not null default now(),
  constraint qr_reserva_fila_unica check (id = 1)
);

insert into public.qr_reserva (id, ocupado)
values (1, false)
on conflict (id) do nothing;
