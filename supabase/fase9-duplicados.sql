-- =====================================================================
-- BRUNEL BRAND · FASE 9 · Quitar ventas de Treinta repetidas
--   Caso: la misma venta se anotó en Treinta como UNA sola (ej. $190) y en el
--   panel como VARIAS (ej. $120 + $70). El historial la contaba dos veces.
--   Se considera repetida una venta de Treinta cuando, ese mismo día, las ventas
--   de tienda del panel:
--     a) tienen una venta con el mismo total, o
--     b) del mismo cliente suman exactamente su total, o
--     c) en total del día suman exactamente su total.
--   Las ventas quitadas se guardan en "ventas_historicas_quitadas" (por si acaso).
-- Requiere fase7.sql. Se puede ejecutar más de una vez.
-- =====================================================================

create table if not exists public.ventas_historicas_quitadas (
  like public.ventas_historicas,
  quitada_en timestamptz not null default now(),
  motivo text
);
alter table public.ventas_historicas_quitadas enable row level security;
revoke all on public.ventas_historicas_quitadas from anon, authenticated;

drop table if exists _repetidas;
create temp table _repetidas as
with tienda as (
  select (o.creado_en at time zone 'America/Guayaquil')::date as fecha,
         public.clave_cliente(o.cliente_nombre) as clave, o.total
  from public.orders o
  where o.canal = 'tienda' and o.estado in ('por_cobrar', 'pagado', 'enviado', 'entregado')
)
select h.id,
       case
         when exists (select 1 from tienda t where t.fecha = h.fecha and t.total = h.valor) then 'mismo total el mismo día'
         when public.clave_cliente(h.cliente_nombre) is not null
              and (select sum(t.total) from tienda t where t.fecha = h.fecha and t.clave = public.clave_cliente(h.cliente_nombre)) = h.valor
           then 'ventas del mismo cliente ese día suman lo mismo'
         else 'ventas del día suman lo mismo'
       end as motivo
from public.ventas_historicas h
where h.origen = 'treinta'
  and (
    exists (select 1 from tienda t where t.fecha = h.fecha and t.total = h.valor)
    or (public.clave_cliente(h.cliente_nombre) is not null
        and (select sum(t.total) from tienda t where t.fecha = h.fecha and t.clave = public.clave_cliente(h.cliente_nombre)) = h.valor)
    or (select sum(t.total) from tienda t where t.fecha = h.fecha) = h.valor
  );

insert into public.ventas_historicas_quitadas
select h.*, now(), r.motivo from public.ventas_historicas h join _repetidas r on r.id = h.id;

-- Sus prendas se borran solas (on delete cascade)
delete from public.ventas_historicas h using _repetidas r where r.id = h.id;

-- Revisión: las ventas que se quitaron
select fecha, cliente_nombre as cliente, valor, descripcion_original as detalle, motivo
from public.ventas_historicas_quitadas
order by quitada_en desc, fecha desc;
