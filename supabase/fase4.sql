-- =====================================================================
-- BRUNEL BRAND · FASE 4: aporte a la empresa, ganancia por vendedor,
-- costo de reposición, historial por cliente y resumen mensual.
-- Requiere historico.sql y alertas-stock.sql. Pega TODO en Supabase > SQL Editor > Run.
-- Re-ejecutable.
--
-- Regla: por cada prenda vendida, a la empresa vuelve el COSTO de la prenda + un
-- APORTE fijo (3 USD, editable en configuracion). El resto es GANANCIA de quien vendió.
-- =====================================================================

-- 1. Configuración del aporte por prenda
insert into public.configuracion (clave, valor) values ('aporte_por_prenda', '3'::jsonb)
on conflict (clave) do nothing;

-- 2. Cada venta guarda el aporte vigente cuando se hizo (si luego cambias el valor,
--    las ventas anteriores no se recalculan)
alter table public.orders add column if not exists aporte_por_prenda numeric(10,2);

create or replace function public.orders_fijar_aporte()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.aporte_por_prenda is null then
    new.aporte_por_prenda := coalesce((select (valor #>> '{}')::numeric from public.configuracion where clave = 'aporte_por_prenda'), 3);
  end if;
  return new;
end $$;

drop trigger if exists orders_fijar_aporte on public.orders;
create trigger orders_fijar_aporte before insert on public.orders
  for each row execute function public.orders_fijar_aporte();

update public.orders set aporte_por_prenda = 3 where aporte_por_prenda is null;

-- 3. Costo de reposición (lo que cuesta HOY volver a comprar la prenda). Si está vacío,
--    se usa el costo normal. Solo admin (misma seguridad que productos_costos).
alter table public.productos_costos add column if not exists costo_reposicion numeric(10,2);
do $$ begin
  alter table public.productos_costos add constraint productos_costos_reposicion_check check (costo_reposicion is null or costo_reposicion >= 0);
exception when duplicate_object then null; end $$;

-- 4. ¿La llamada viene del servidor de la tienda (clave secreta)? Para el correo mensual.
create or replace function public.es_servicio()
returns boolean language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
      or coalesce(current_setting('role', true), '') = 'service_role';
$$;

-- 5. Clientes: buscar y ver su historial (solo rol admin: son datos personales)
create or replace function public.buscar_clientes(p_texto text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_admin_total() then
    raise exception 'Solo el administrador puede ver clientes.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(x) from (
    select min(nombre) as nombre, max(telefono) as telefono, count(*) as compras, sum(valor) as total, max(fecha) as ultima
    from (
      select cliente_nombre as nombre, null::text as telefono, valor, fecha from public.ventas_historicas
      union all
      select cliente_nombre, nullif(cliente_telefono, '-'), total, (coalesce(pagado_en, creado_en) at time zone 'America/Guayaquil')::date
      from public.orders where estado in ('pagado', 'enviado', 'entregado') and cliente_nombre <> 'Cliente en tienda'
    ) c
    where nombre is not null and length(trim(p_texto)) >= 2 and nombre ilike '%' || trim(p_texto) || '%'
    group by lower(trim(nombre))
    order by sum(valor) desc
    limit 8) x), '[]'::jsonb);
end $$;

create or replace function public.historial_cliente(p_nombre text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.es_admin_total() then
    raise exception 'Solo el administrador puede ver clientes.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(x order by x.fecha desc) from (
    select h.fecha, 'Treinta' as origen, h.descripcion_original as detalle, h.valor, h.metodo_pago, h.vendedor
    from public.ventas_historicas h
    where lower(trim(h.cliente_nombre)) = lower(trim(p_nombre))
    union all
    select (coalesce(o.pagado_en, o.creado_en) at time zone 'America/Guayaquil')::date,
           case when o.canal = 'web' then 'Web' else 'Tienda' end,
           (select string_agg(i.cantidad || ' ' || i.nombre || ' (' || i.talla || ') $' || i.precio_unitario, ', ' order by i.id)
              from public.order_items i where i.order_id = o.id),
           o.total, o.metodo_pago, coalesce(o.vendedor_nombre, 'Tienda online')
    from public.orders o
    where o.estado in ('pagado', 'enviado', 'entregado') and lower(trim(o.cliente_nombre)) = lower(trim(p_nombre))
    order by 1 desc
    limit 30) x), '[]'::jsonb);
end $$;

revoke execute on function public.buscar_clientes(text), public.historial_cliente(text) from public, anon;
grant execute on function public.buscar_clientes(text), public.historial_cliente(text) to authenticated;

-- 6. Balance ampliado: ganancia por vendedor, empresa, inventario, reponer pronto y plata quieta
create or replace function public.balance_datos(p_desde date default null, p_hasta date default null)
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  tz constant text := 'America/Guayaquil';
  hoy date := (now() at time zone tz)::date;
  desde date;
  hasta date := coalesce(p_hasta, hoy);
  mes_ref date := date_trunc('month', coalesce(p_hasta, hoy))::date;
  resultado jsonb;
  aporte_cfg numeric := coalesce((select (valor #>> '{}')::numeric from public.configuracion where clave = 'aporte_por_prenda'), 3);
begin
  if not (public.es_admin_total() or public.es_servicio()) then
    raise exception 'Solo el administrador puede ver el balance.' using errcode = '42501';
  end if;

  select coalesce(p_desde, least(
           (select min(fecha) from public.ventas_historicas),
           (select min((coalesce(pagado_en, creado_en) at time zone tz)::date) from public.orders),
           hoy))
    into desde;

  with
  -- Todas las ventas, viejas y nuevas, con la misma forma
  ventas as (
    select 'historico'::text as canal, h.fecha, h.vendedor, h.metodo_pago, h.estado,
           h.valor, h.costo, h.cliente_nombre as cliente,
           h.valor as valor_productos,
           coalesce((select sum(i.cantidad) from public.ventas_historicas_items i where i.venta_id = h.id), 0) as unidades,
           aporte_cfg as aporte_unit,
           (select case when bool_and(pc.producto_id is not null)
                        then sum(i.cantidad * coalesce(pc.costo_reposicion, pc.costo)) end
              from public.ventas_historicas_items i
              left join public.prendas_historicas ph on ph.clave = i.prenda_clave and ph.estado in ('automatico', 'confirmado')
              left join public.productos_costos pc on pc.producto_id = ph.producto_id
              where i.venta_id = h.id) as reposicion
    from public.ventas_historicas h
    union all
    select o.canal,
           (coalesce(o.pagado_en, o.creado_en) at time zone tz)::date,
           coalesce(o.vendedor_nombre, case when o.canal = 'web' then 'Tienda online' else 'Sin vendedor' end),
           coalesce(o.metodo_pago, 'payphone'),
           'pagado',
           o.total,
           (select case when bool_and(i.costo_unitario is not null) then sum(i.costo_unitario * i.cantidad) end
              from public.order_items i where i.order_id = o.id),
           case when o.canal = 'web' or o.cliente_nombre <> 'Cliente en tienda' then o.cliente_nombre end,
           o.subtotal,
           coalesce((select sum(i.cantidad) from public.order_items i where i.order_id = o.id), 0),
           coalesce(o.aporte_por_prenda, aporte_cfg),
           (select case when bool_and(coalesce(pc.costo_reposicion, pc.costo, i.costo_unitario) is not null)
                        then sum(i.cantidad * coalesce(pc.costo_reposicion, pc.costo, i.costo_unitario)) end
              from public.order_items i
              left join public.productos_costos pc on pc.producto_id = i.producto_id
              where i.order_id = o.id)
    from public.orders o
    where o.estado in ('pagado', 'enviado', 'entregado')
  ),
  -- Reparto de cada venta: a la empresa vuelve el costo + el aporte por prenda; el resto es del vendedor
  reparto as (
    select ventas.*,
           unidades * aporte_unit as aporte,
           case when costo is not null then valor_productos - costo - unidades * aporte_unit end as ganancia_vendedor,
           case when costo is not null then costo + unidades * aporte_unit - coalesce(reposicion, costo) end as saldo_empresa
    from ventas
  ),
  v as (select * from reparto where fecha between desde and hasta),

  -- Prendas vendidas, viejas y nuevas. En el historial, el valor por prenda solo
  -- se conoce si la venta tuvo una sola línea (dato exacto, sin repartir montos).
  lineas as (
    select h.fecha,
           coalesce(case when ph.estado in ('automatico', 'confirmado') then ph.producto_id::text end, 'h:' || i.prenda_clave) as prenda_id,
           coalesce(case when ph.estado in ('automatico', 'confirmado') then pr.nombre end, ph.nombre, i.nombre_original) as nombre,
           i.cantidad,
           case when n.lineas = 1 then h.valor end as valor,
           case when n.lineas = 1 then h.costo end as costo
    from public.ventas_historicas_items i
    join public.ventas_historicas h on h.id = i.venta_id
    join (select venta_id, count(*) as lineas from public.ventas_historicas_items group by venta_id) n on n.venta_id = h.id
    left join public.prendas_historicas ph on ph.clave = i.prenda_clave
    left join public.productos pr on pr.id = ph.producto_id
    union all
    select (coalesce(o.pagado_en, o.creado_en) at time zone tz)::date,
           coalesce(i.producto_id::text, 's:' || i.sku),
           coalesce(pr.nombre, i.nombre),
           i.cantidad, i.subtotal, i.costo_unitario * i.cantidad
    from public.order_items i
    join public.orders o on o.id = i.order_id and o.estado in ('pagado', 'enviado', 'entregado')
    left join public.productos pr on pr.id = i.producto_id
  ),
  l as (select * from lineas where fecha between desde and hasta),

  mensual as (
    select date_trunc('month', fecha)::date as mes,
           sum(valor) as ventas,
           sum(valor - costo) filter (where costo is not null) as utilidad,
           count(*) as n
    from ventas group by 1
  ),
  prendas as (
    select prenda_id, min(nombre) as nombre,
           sum(cantidad) as unidades,
           sum(valor) as ventas,
           sum(valor - costo) filter (where valor is not null and costo is not null) as utilidad,
           sum(cantidad) filter (where valor is not null) as unidades_con_valor
    from l group by prenda_id
  )

  select jsonb_build_object(
    'desde', desde,
    'hasta', hasta,
    'primera_venta', (select min(fecha) from ventas),

    'resumen', (
      select jsonb_build_object(
        'ventas', coalesce(sum(valor), 0),
        'n', count(*),
        'utilidad', coalesce(sum(valor - costo) filter (where costo is not null), 0),
        'ventas_con_costo', coalesce(sum(valor) filter (where costo is not null), 0),
        'ticket', coalesce(round(avg(valor), 2), 0)
      ) from v),

    'diario', coalesce((
      select jsonb_agg(d order by d.fecha) from (
        select fecha, sum(valor) as ventas, sum(valor - costo) filter (where costo is not null) as utilidad, count(*) as n
        from v group by fecha
      ) d), '[]'::jsonb),

    'mensual', coalesce((
      select jsonb_agg(jsonb_build_object('mes', to_char(mes, 'YYYY-MM'), 'ventas', ventas, 'utilidad', coalesce(utilidad, 0), 'n', n) order by mes)
      from mensual where mes between date_trunc('month', desde) and date_trunc('month', hasta)), '[]'::jsonb),

    'comparacion', jsonb_build_object(
      'mes', to_char(mes_ref, 'YYYY-MM'),
      'actual',   (select jsonb_build_object('ventas', coalesce(ventas, 0), 'utilidad', coalesce(utilidad, 0), 'n', coalesce(n, 0)) from (select 1) x left join mensual on mes = mes_ref),
      'anterior', (select jsonb_build_object('ventas', coalesce(ventas, 0), 'utilidad', coalesce(utilidad, 0), 'n', coalesce(n, 0)) from (select 1) x left join mensual on mes = (mes_ref - interval '1 month')::date),
      'anio_anterior', (select jsonb_build_object('ventas', coalesce(ventas, 0), 'utilidad', coalesce(utilidad, 0), 'n', coalesce(n, 0)) from (select 1) x left join mensual on mes = (mes_ref - interval '1 year')::date),
      'hay_anio_anterior', exists (select 1 from ventas where fecha < (mes_ref - interval '11 months')::date)
    ),

    'por_vendedor', coalesce((select jsonb_agg(x order by x.ventas desc) from (
        select vendedor as nombre, sum(valor) as ventas, sum(valor - costo) filter (where costo is not null) as utilidad, count(*) as n
        from v group by vendedor) x), '[]'::jsonb),
    'por_metodo', coalesce((select jsonb_agg(x order by x.ventas desc) from (
        select coalesce(metodo_pago, 'sin dato') as nombre, sum(valor) as ventas, count(*) as n from v group by 1) x), '[]'::jsonb),
    'por_estado', coalesce((select jsonb_agg(x order by x.ventas desc) from (
        select estado as nombre, sum(valor) as ventas, count(*) as n from v group by 1) x), '[]'::jsonb),
    'por_canal', coalesce((select jsonb_agg(x order by x.ventas desc) from (
        select canal as nombre, sum(valor) as ventas, count(*) as n from v group by 1) x), '[]'::jsonb),

    'dias_semana', coalesce((select jsonb_agg(x order by x.dia) from (
        select extract(isodow from fecha)::int as dia, sum(valor) as ventas, count(*) as n
        from v group by 1) x), '[]'::jsonb),

    'clientes', coalesce((select jsonb_agg(x) from (
        select min(cliente) as nombre, count(*) as compras, sum(valor) as ventas, max(fecha) as ultima
        from v where cliente is not null and trim(cliente) <> ''
        group by lower(trim(cliente))
        order by sum(valor) desc limit 10) x), '[]'::jsonb),

    'prendas_vendidas', coalesce((select jsonb_agg(x) from (
        select * from prendas order by unidades desc, ventas desc nulls last limit 15) x), '[]'::jsonb),
    'prendas_rentables', coalesce((select jsonb_agg(x) from (
        select * from prendas where utilidad is not null order by utilidad desc limit 15) x), '[]'::jsonb),

    'prendas_mensual', coalesce((select jsonb_agg(x order by x.mes) from (
        select to_char(date_trunc('month', l.fecha), 'YYYY-MM') as mes, l.prenda_id, min(l.nombre) as nombre, sum(l.cantidad) as unidades
        from l
        where l.prenda_id in (select prenda_id from prendas order by unidades desc limit 6)
        group by 1, 2) x), '[]'::jsonb),

    'poco_movimiento', coalesce((select jsonb_agg(x) from (
        select p.nombre, p.sku, coalesce(sum(pt.stock), 0) as stock,
               coalesce((select sum(cantidad) from l where l.prenda_id = p.id::text), 0) as unidades
        from public.productos p
        left join public.producto_tallas pt on pt.producto_id = p.id
        where p.activo
        group by p.id, p.nombre, p.sku
        having coalesce((select sum(cantidad) from l where l.prenda_id = p.id::text), 0) <= 1
        order by 4 asc, 3 desc
        limit 25) x), '[]'::jsonb),

    'aporte_por_prenda', aporte_cfg,

    'ganancias', coalesce((select jsonb_agg(x order by x.ganancia desc nulls last) from (
        select vendedor as nombre, sum(valor) as ventas, sum(unidades) as prendas, sum(costo) as costo,
               sum(aporte) as aporte, sum(ganancia_vendedor) as ganancia, count(*) as n,
               count(*) filter (where costo is null) as sin_costo
        from v group by vendedor) x), '[]'::jsonb),

    'ganancias_mensual', coalesce((select jsonb_agg(x order by x.mes, x.nombre) from (
        select to_char(date_trunc('month', fecha), 'YYYY-MM') as mes, vendedor as nombre,
               sum(valor) as ventas, sum(unidades) as prendas, sum(ganancia_vendedor) as ganancia
        from v group by 1, 2) x), '[]'::jsonb),

    'empresa', (select jsonb_build_object(
        'costo_devuelto', coalesce(sum(costo), 0),
        'aportes', coalesce(sum(aporte), 0),
        'reposicion', coalesce(sum(coalesce(reposicion, costo)), 0),
        'saldo', coalesce(sum(saldo_empresa), 0),
        'prendas', coalesce(sum(unidades), 0)) from v),

    'empresa_mensual', coalesce((select jsonb_agg(x order by x.mes) from (
        select to_char(m.mes, 'YYYY-MM') as mes, m.costo_devuelto, m.aportes, m.reposicion, m.saldo,
               coalesce(g.total, 0) as compras
        from (
          select date_trunc('month', fecha) as mes,
                 sum(costo) as costo_devuelto, sum(aporte) as aportes,
                 sum(coalesce(reposicion, costo)) as reposicion, sum(saldo_empresa) as saldo
          from v group by 1
        ) m
        left join (
          select date_trunc('month', fecha) as mes, sum(valor) as total
          from public.gastos_historicos where categoria = 'compra_mercaderia' group by 1
        ) g on g.mes = m.mes) x), '[]'::jsonb),

    'inventario', (select jsonb_build_object(
        'prendas', coalesce(sum(pt.stock), 0),
        'a_costo', coalesce(sum(pt.stock * pc.costo), 0),
        'a_reposicion', coalesce(sum(pt.stock * coalesce(pc.costo_reposicion, pc.costo)), 0),
        'sin_costo', coalesce(sum(pt.stock) filter (where pc.producto_id is null), 0))
      from public.producto_tallas pt
      join public.productos p on p.id = pt.producto_id
      left join public.productos_costos pc on pc.producto_id = p.id
      where pt.talla in ('S', 'M', 'L') and pt.stock > 0),

    -- Prendas que se venden y se están acabando (ritmo de los últimos 60 días)
    'reponer_pronto', coalesce((select jsonb_agg(x) from (
        select p.nombre, pt.talla, pt.stock, r.unidades_60d,
               round(pt.stock / (r.unidades_60d / 60.0)) as dias
        from public.producto_tallas pt
        join public.productos p on p.id = pt.producto_id and p.activo
        join (
          select producto_id, talla, sum(cantidad) as unidades_60d from (
            select ph.producto_id, i.talla, i.cantidad
            from public.ventas_historicas_items i
            join public.ventas_historicas h on h.id = i.venta_id and h.fecha > hoy - 60
            join public.prendas_historicas ph on ph.clave = i.prenda_clave and ph.estado in ('automatico', 'confirmado')
            union all
            select i.producto_id, i.talla, i.cantidad
            from public.order_items i
            join public.orders o on o.id = i.order_id and o.estado in ('pagado', 'enviado', 'entregado')
            where (coalesce(o.pagado_en, o.creado_en) at time zone tz)::date > hoy - 60
          ) u group by 1, 2
        ) r on r.producto_id = pt.producto_id and r.talla = pt.talla
        where pt.talla in ('S', 'M', 'L') and pt.stock <= 3
        order by pt.stock / (r.unidades_60d / 60.0) asc, r.unidades_60d desc
        limit 10) x), '[]'::jsonb),

    -- Stock que no se vendió en el periodo (plata quieta, a costo)
    'plata_quieta', (select jsonb_build_object(
        'total', coalesce(sum(valor), 0), 'productos', count(*),
        'top', coalesce(jsonb_agg(jsonb_build_object('nombre', nombre, 'stock', stock, 'valor', valor) order by valor desc) filter (where rn <= 5), '[]'::jsonb))
      from (
        select p.nombre, sum(pt.stock) as stock, sum(pt.stock) * coalesce(max(pc.costo), 0) as valor,
               row_number() over (order by sum(pt.stock) * coalesce(max(pc.costo), 0) desc) as rn
        from public.productos p
        join public.producto_tallas pt on pt.producto_id = p.id and pt.talla in ('S', 'M', 'L')
        left join public.productos_costos pc on pc.producto_id = p.id
        where p.activo and not exists (select 1 from l where l.prenda_id = p.id::text)
        group by p.id, p.nombre
        having sum(pt.stock) > 0
      ) q),

    'gastos', jsonb_build_object(
      'compras_mercaderia', coalesce((select sum(valor) from public.gastos_historicos where categoria = 'compra_mercaderia' and fecha between desde and hasta), 0),
      'operativos', coalesce((select sum(valor) from public.gastos_historicos where categoria = 'operativo' and fecha between desde and hasta), 0),
      'abonos', coalesce((select sum(valor) from public.gastos_historicos where categoria = 'abono_gasto' and fecha between desde and hasta), 0),
      'compras_mensual', coalesce((select jsonb_agg(x order by x.mes) from (
          select to_char(date_trunc('month', fecha), 'YYYY-MM') as mes, sum(valor) as total
          from public.gastos_historicos where categoria = 'compra_mercaderia' and fecha between desde and hasta
          group by 1) x), '[]'::jsonb)
    )
  ) into resultado;

  return resultado;
end $$;

revoke execute on function public.balance_datos(date, date) from public, anon;
grant execute on function public.balance_datos(date, date) to authenticated, service_role;
