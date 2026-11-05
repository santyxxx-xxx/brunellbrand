-- =====================================================================
-- BRUNEL BRAND · FASE 6
--   1. Contador público de prendas entregadas (historial completo, redondeado hacia abajo en la web)
--   2. Historial de ventas para el panel (Treinta + tienda + web, y totales 2024–2025)
-- Requiere fase5.sql. Pega TODO en Supabase > SQL Editor > Run. Se puede ejecutar más de una vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PRENDAS ENTREGADAS (público: solo devuelve un número, ningún dato de clientes)
--    Notas 2024–2025 + historial de Treinta + ventas del panel y la web (sin canceladas ni pendientes)
-- ---------------------------------------------------------------------
create or replace function public.prendas_entregadas()
returns bigint language sql stable security definer set search_path = public as $$
  select
    coalesce((select sum(r.prendas) from public.ventas_resumen_mensual r
               where not exists (select 1 from public.ventas_historicas h
                                 where date_trunc('month', h.fecha) = r.mes)), 0)
  + coalesce((select sum(i.cantidad) from public.ventas_historicas_items i), 0)
  + coalesce((select sum(i.cantidad) from public.order_items i
               join public.orders o on o.id = i.order_id
              where o.estado in ('por_cobrar', 'pagado', 'enviado', 'entregado')), 0);
$$;
revoke execute on function public.prendas_entregadas() from public;
grant execute on function public.prendas_entregadas() to anon, authenticated;

-- ---------------------------------------------------------------------
-- 2. HISTORIAL DE VENTAS DE UN AÑO (solo rol admin: tiene datos de clientes)
-- ---------------------------------------------------------------------
create or replace function public.historial_ventas(p_anio int default null)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  tz constant text := 'America/Guayaquil';
  anio int := coalesce(p_anio, extract(year from (now() at time zone tz))::int);
begin
  if not public.es_admin_total() then
    raise exception 'Solo el administrador puede ver el historial.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'anio', anio,

    'anios', (
      select coalesce(jsonb_agg(a order by a desc), '[]'::jsonb) from (
        select distinct extract(year from mes)::int as a from public.ventas_resumen_mensual
        union select distinct extract(year from fecha)::int from public.ventas_historicas
        union select distinct extract(year from (creado_en at time zone tz))::int from public.orders
        union select extract(year from (now() at time zone tz))::int
      ) x),

    'ventas', coalesce((
      select jsonb_agg(v order by v.fecha desc, v.creado desc) from (
        select 'h' || h.id as id, null::uuid as pedido_id, null::bigint as numero, 'treinta' as origen,
               h.fecha, h.fecha::timestamp as creado,
               nullif(trim(h.cliente_nombre), '') as cliente, h.vendedor,
               h.descripcion_original as detalle,
               coalesce((select sum(i.cantidad) from public.ventas_historicas_items i where i.venta_id = h.id), 0) as prendas,
               h.valor as total, h.costo, h.metodo_pago as metodo, h.estado, null::text as entrega
        from public.ventas_historicas h
        where extract(year from h.fecha) = anio
        union all
        select o.id::text, o.id, o.numero, o.canal,
               (o.creado_en at time zone tz)::date, (o.creado_en at time zone tz),
               case when o.cliente_nombre <> 'Cliente en tienda' then o.cliente_nombre end,
               coalesce(o.vendedor_nombre, case when o.canal = 'web' then 'Tienda online' end),
               (select string_agg(i.cantidad || ' ' || i.nombre || ' (' || i.talla || ')', ', ' order by i.id)
                  from public.order_items i where i.order_id = o.id),
               coalesce((select sum(i.cantidad) from public.order_items i where i.order_id = o.id), 0),
               o.total,
               (select case when bool_and(i.costo_unitario is not null) then sum(i.costo_unitario * i.cantidad) end
                  from public.order_items i where i.order_id = o.id),
               coalesce(o.metodo_pago, case when o.canal = 'web' then 'payphone' end),
               o.estado,
               case when o.canal = 'web' then o.envio_nombre else o.entrega end
        from public.orders o
        where o.estado in ('por_cobrar', 'pagado', 'enviado', 'entregado')
          and extract(year from (o.creado_en at time zone tz)) = anio
      ) v), '[]'::jsonb),

    -- Meses que solo tienen el total anotado (sin detalle de cada venta)
    'meses_notas', coalesce((
      select jsonb_agg(jsonb_build_object('mes', to_char(r.mes, 'YYYY-MM'), 'prendas', r.prendas, 'ventas', r.ventas) order by r.mes desc)
      from public.ventas_resumen_mensual r
      where extract(year from r.mes) = anio
        and not exists (select 1 from public.ventas_historicas h where date_trunc('month', h.fecha) = r.mes)
        and not exists (select 1 from public.orders o
                        where date_trunc('month', (o.creado_en at time zone tz)) = r.mes
                          and o.estado in ('por_cobrar', 'pagado', 'enviado', 'entregado'))
    ), '[]'::jsonb),

    'dudosas', (select count(*) from public.prendas_historicas where estado in ('dudoso', 'sin_coincidencia'))
  );
end $$;

revoke execute on function public.historial_ventas(int) from public, anon;
grant execute on function public.historial_ventas(int) to authenticated;

-- Revisión
select public.prendas_entregadas() as prendas_entregadas;
