-- =====================================================================
-- BRUNEL BRAND · HISTORIAL DE VENTAS (Treinta) + BALANCE UNIFICADO
-- Requisitos: esquema.sql, fase2.sql, fase3.sql ya ejecutados.
-- Pega TODO en Supabase > SQL Editor > Run. Se puede ejecutar más de una vez.
-- Después ejecuta supabase/importar-treinta.sql (los datos).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. VENTAS HISTÓRICAS (una fila por venta, tal como venía en Treinta)
--    No tocan el stock ni los productos actuales.
-- ---------------------------------------------------------------------
create table if not exists public.ventas_historicas (
  id                    bigint generated always as identity primary key,
  origen                text not null default 'treinta',
  clave_origen          text not null unique,          -- evita duplicados al repetir la importación
  fecha                 date not null,
  vendedor              text not null,                 -- normalizado: Santiago / Mateo
  vendedor_original     text,
  descripcion_original  text not null,
  contacto_original     text,                          -- dato de cliente: solo admin
  cliente_nombre        text,                          -- dato de cliente: solo admin
  cliente_nota          text,
  estado                text not null default 'pagado' check (estado in ('pagado', 'por_cobrar')),
  metodo_pago           text check (metodo_pago in ('payphone', 'efectivo', 'transferencia', 'tarjeta')),
  valor                 numeric(10,2) not null,        -- lo que pagó el cliente
  costo                 numeric(10,2) not null default 0,
  utilidad              numeric(10,2) generated always as (valor - costo) stored,
  importado_en          timestamptz not null default now()
);
create index if not exists ventas_historicas_fecha_idx on public.ventas_historicas (fecha);

-- Prendas de cada venta (cantidad, talla y corte limpios). Sin valor por prenda:
-- Treinta solo trae el total de la venta.
create table if not exists public.ventas_historicas_items (
  id               bigint generated always as identity primary key,
  venta_id         bigint not null references public.ventas_historicas(id) on delete cascade,
  cantidad         int not null check (cantidad > 0),
  nombre_original  text not null,
  talla            text,
  corte            text,
  prenda_clave     text not null
);
create index if not exists ventas_historicas_items_venta_idx on public.ventas_historicas_items (venta_id);
create index if not exists ventas_historicas_items_prenda_idx on public.ventas_historicas_items (prenda_clave);

-- Prendas agrupadas y su relación con el catálogo actual
--   automatico       = mismo nombre y corte (ignorando mayúsculas, tildes y espacios)
--   dudoso           = parecido; necesita tu confirmación
--   sin_coincidencia = no se encontró en el catálogo
--   confirmado       = lo confirmaste tú (con producto)
--   descartado       = confirmaste que no está en el catálogo
create table if not exists public.prendas_historicas (
  clave            text primary key,
  nombre           text not null,
  unidades         int not null default 0,
  producto_id      uuid references public.productos(id) on delete set null,
  sugerido_id      uuid references public.productos(id) on delete set null,
  estado           text not null default 'sin_coincidencia'
                   check (estado in ('automatico', 'dudoso', 'sin_coincidencia', 'confirmado', 'descartado')),
  confianza        numeric(3,2),
  revisado_por     text,
  revisado_en      timestamptz
);

-- Gastos del historial: compras de mercadería, operativos y abonos (por separado)
create table if not exists public.gastos_historicos (
  id             bigint generated always as identity primary key,
  origen         text not null default 'treinta',
  clave_origen   text not null unique,
  fecha          date not null,
  categoria      text not null check (categoria in ('compra_mercaderia', 'operativo', 'abono_gasto')),
  tipo_original  text,
  descripcion    text,
  proveedor      text,
  metodo_pago    text,
  registrado_por text,
  valor          numeric(10,2) not null,
  importado_en   timestamptz not null default now()
);
create index if not exists gastos_historicos_fecha_idx on public.gastos_historicos (fecha);

-- ---------------------------------------------------------------------
-- 2. SEGURIDAD: todo el historial (incluye clientes) es SOLO para el rol admin
-- ---------------------------------------------------------------------
revoke all on public.ventas_historicas, public.ventas_historicas_items,
              public.prendas_historicas, public.gastos_historicos from anon;
grant select on public.ventas_historicas, public.ventas_historicas_items, public.gastos_historicos to authenticated;
grant select, update on public.prendas_historicas to authenticated;

alter table public.ventas_historicas       enable row level security;
alter table public.ventas_historicas_items enable row level security;
alter table public.prendas_historicas      enable row level security;
alter table public.gastos_historicos       enable row level security;

drop policy if exists "Admin ve ventas historicas" on public.ventas_historicas;
create policy "Admin ve ventas historicas" on public.ventas_historicas
  for select to authenticated using (public.es_admin_total());

drop policy if exists "Admin ve items historicos" on public.ventas_historicas_items;
create policy "Admin ve items historicos" on public.ventas_historicas_items
  for select to authenticated using (public.es_admin_total());

drop policy if exists "Admin ve gastos historicos" on public.gastos_historicos;
create policy "Admin ve gastos historicos" on public.gastos_historicos
  for select to authenticated using (public.es_admin_total());

drop policy if exists "Admin ve prendas historicas" on public.prendas_historicas;
create policy "Admin ve prendas historicas" on public.prendas_historicas
  for select to authenticated using (public.es_admin_total());
drop policy if exists "Admin confirma prendas historicas" on public.prendas_historicas;
create policy "Admin confirma prendas historicas" on public.prendas_historicas
  for update to authenticated using (public.es_admin_total()) with check (public.es_admin_total());
-- (La importación se hace desde el SQL Editor, que no pasa por estas reglas.)

-- ---------------------------------------------------------------------
-- 3. BALANCE UNIFICADO: historial de Treinta + ventas nuevas (web y tienda)
--    Fechas en hora de Ecuador. Solo rol admin.
-- ---------------------------------------------------------------------
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
begin
  if not public.es_admin_total() then
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
           h.valor, h.costo, h.cliente_nombre as cliente
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
           case when o.canal = 'web' or o.cliente_nombre <> 'Cliente en tienda' then o.cliente_nombre end
    from public.orders o
    where o.estado in ('pagado', 'enviado', 'entregado')
  ),
  v as (select * from ventas where fecha between desde and hasta),

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
grant execute on function public.balance_datos(date, date) to authenticated;
