-- =====================================================================
-- BRUNEL BRAND · FASE 5
--   1. Dos nombres por prenda: el del panel (interno) y el de la web (público),
--      con opción Oxford / Casual agrupada en un solo modelo.
--   2. Vuelven Básicas, Polos Lacoste y Polos Ralph Lauren (solo en el panel).
--   3. Ventas "por cobrar" y tipo de entrega en la venta rápida.
--   4. Totales mensuales de 2024 y 2025 (de las notas) para el balance.
-- Pega TODO en Supabase > SQL Editor > Run. Se puede ejecutar más de una vez.
-- NO borra ventas ni pedidos y NO cambia el stock de las prendas que ya están.
-- Después ejecuta importar-treinta.sql (actualizado).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. COLUMNAS NUEVAS
-- ---------------------------------------------------------------------
alter table public.productos add column if not exists nombre_interno text;  -- nombre del panel (con proveedor, jerga…)
alter table public.productos add column if not exists grupo text;           -- modelo público: une Oxford y Casual
alter table public.productos add column if not exists opcion text;          -- 'Oxford', 'Casual' o vacío
create index if not exists productos_grupo_idx on public.productos (grupo);

alter table public.categorias add column if not exists visible boolean not null default true; -- false = solo panel

alter table public.orders add column if not exists entrega text;
do $$ begin
  alter table public.orders drop constraint if exists orders_entrega_check;
  alter table public.orders add constraint orders_entrega_check
    check (entrega is null or entrega in ('personal', 'domicilio', 'servientrega'));
end $$;

-- La web no muestra prendas de categorías ocultas (Básicas, Polos): esas se venden solo desde el panel
drop policy if exists "Productos visibles para todos" on public.productos;
create policy "Productos visibles para todos" on public.productos
  for select using (
    public.es_admin()
    or (activo and not exists (
      select 1 from public.categorias c where c.id = productos.categoria_id and not c.visible)));

-- El público (sin sesión) no puede leer el nombre interno
revoke select on public.productos from anon;
grant select (id, sku, nombre, slug, descripcion, precio, precio_anterior, categoria_id, imagenes,
              destacado, activo, creado_en, actualizado_en, grupo, opcion)
  on public.productos to anon;

-- ---------------------------------------------------------------------
-- 2. ESTADO "POR COBRAR": la prenda ya salió (descuenta stock) pero falta el pago
-- ---------------------------------------------------------------------
do $$ begin
  alter table public.orders drop constraint if exists orders_estado_check;
  alter table public.orders add constraint orders_estado_check
    check (estado in ('pendiente_pago', 'por_cobrar', 'pagado', 'enviado', 'entregado', 'cancelado'));
end $$;

create or replace function public.orders_aplicar_stock()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  item record;
  disponible int;
  faltante boolean := false;
begin
  if new.estado in ('por_cobrar', 'pagado', 'enviado', 'entregado') and not old.stock_descontado then
    for item in
      select producto_id, talla, cantidad from public.order_items
      where order_id = new.id and producto_id is not null
    loop
      select stock into disponible from public.producto_tallas
        where producto_id = item.producto_id and talla = item.talla
        for update;
      if disponible is null or disponible < item.cantidad then
        faltante := true;
      end if;
      update public.producto_tallas
        set stock = greatest(stock - item.cantidad, 0)
        where producto_id = item.producto_id and talla = item.talla;
    end loop;
    new.stock_descontado := true;
    new.stock_insuficiente := faltante;

  elsif new.estado = 'cancelado' and old.stock_descontado then
    for item in
      select producto_id, talla, cantidad from public.order_items
      where order_id = new.id and producto_id is not null
    loop
      update public.producto_tallas
        set stock = stock + item.cantidad
        where producto_id = item.producto_id and talla = item.talla;
    end loop;
    new.stock_descontado := false;
  end if;

  -- "pagado_en" marca cuándo entró la plata (una venta por cobrar lo recibe al cobrarse)
  if new.estado in ('pagado', 'enviado', 'entregado') then new.pagado_en := coalesce(new.pagado_en, now()); end if;
  if new.estado = 'enviado' then new.enviado_en := coalesce(new.enviado_en, now()); end if;
  if new.estado = 'entregado' then new.entregado_en := coalesce(new.entregado_en, now()); end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 3. VENTA RÁPIDA v2: tipo de entrega y si ya se cobró
--    personal + cobrada  → entregado
--    domicilio / Servientrega + cobrada → pagado (falta enviar; se sigue en Pedidos)
--    no cobrada → por cobrar (el stock igual se descuenta)
-- ---------------------------------------------------------------------
drop function if exists public.registrar_venta_tienda(jsonb, text, text, text, text);

create or replace function public.registrar_venta_tienda(
  p_items jsonb,
  p_metodo_pago text default null,
  p_cliente_nombre text default null,
  p_cliente_telefono text default null,
  p_notas text default null,
  p_entrega text default 'personal',
  p_cobrado boolean default true
)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  v_vendedor text;
  v_order_id uuid;
  v_numero bigint;
  v_total numeric(10,2) := 0;
  v_linea record;
  v_stock int;
  v_prod record;
  v_entrega text := coalesce(nullif(p_entrega, ''), 'personal');
  v_cobrado boolean := coalesce(p_cobrado, true);
  v_estado text;
begin
  if not public.es_admin() then
    raise exception 'No tienes permiso para registrar ventas.' using errcode = '42501';
  end if;
  if v_entrega not in ('personal', 'domicilio', 'servientrega') then
    raise exception 'Elige cómo se entrega la prenda.';
  end if;
  if v_cobrado and (p_metodo_pago is null or p_metodo_pago not in ('efectivo', 'transferencia', 'tarjeta')) then
    raise exception 'Elige un método de pago válido.';
  end if;
  if p_metodo_pago is not null and p_metodo_pago not in ('efectivo', 'transferencia', 'tarjeta') then
    raise exception 'Elige un método de pago válido.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta no tiene productos.';
  end if;

  for v_linea in
    select (e->>'productoId')::uuid as producto_id,
           upper(e->>'talla') as talla,
           sum((e->>'cantidad')::int) as cantidad,
           min((e->>'precio')::numeric) as precio_min
    from jsonb_array_elements(p_items) e
    group by 1, 2
  loop
    if v_linea.cantidad is null or v_linea.cantidad < 1 or v_linea.precio_min is null or v_linea.precio_min < 0 then
      raise exception 'Revisa las cantidades y los precios.';
    end if;
    select coalesce(nombre_interno, nombre) as nombre into v_prod from public.productos where id = v_linea.producto_id;
    if not found then raise exception 'Un producto ya no existe.'; end if;
    select stock into v_stock from public.producto_tallas
      where producto_id = v_linea.producto_id and talla = v_linea.talla
      for update;
    if coalesce(v_stock, 0) < v_linea.cantidad then
      raise exception 'Stock insuficiente: % talla % (quedan %).', v_prod.nombre, v_linea.talla, coalesce(v_stock, 0);
    end if;
  end loop;

  select coalesce(a.nombre, split_part(u.email, '@', 1)) into v_vendedor
  from public.admins a join auth.users u on u.id = a.user_id
  where a.user_id = auth.uid();

  v_estado := case when not v_cobrado then 'por_cobrar'
                   when v_entrega = 'personal' then 'entregado'
                   else 'pagado' end;

  insert into public.orders (
    canal, vendedor_id, vendedor_nombre, metodo_pago, estado, entrega,
    cliente_nombre, cliente_correo, cliente_telefono,
    provincia, ciudad, sector, direccion,
    envio_metodo, envio_nombre, costo_envio, subtotal, total,
    notas_internas, correos_enviados
  ) values (
    'tienda', auth.uid(), v_vendedor, p_metodo_pago, 'pendiente_pago', v_entrega,
    coalesce(nullif(trim(p_cliente_nombre), ''), 'Cliente en tienda'), '-',
    coalesce(nullif(trim(p_cliente_telefono), ''), '-'),
    'Pichincha', 'Quito', 'Tienda', 'Venta en tienda',
    'tienda',
    case v_entrega when 'personal' then 'Entrega personal' when 'domicilio' then 'A domicilio' else 'Servientrega' end,
    0, 0, 0,
    nullif(trim(p_notas), ''), true
  )
  returning id, numero into v_order_id, v_numero;

  insert into public.order_items
    (order_id, producto_id, sku, nombre, talla, imagen, precio_unitario, cantidad, subtotal, costo_unitario)
  select v_order_id, p.id, p.sku, coalesce(p.nombre_interno, p.nombre), upper(e->>'talla'), p.imagenes[1],
         round((e->>'precio')::numeric, 2),
         (e->>'cantidad')::int,
         round((e->>'precio')::numeric * (e->>'cantidad')::int, 2),
         c.costo
  from jsonb_array_elements(p_items) e
  join public.productos p on p.id = (e->>'productoId')::uuid
  left join public.productos_costos c on c.producto_id = p.id;

  select coalesce(sum(subtotal), 0) into v_total from public.order_items where order_id = v_order_id;

  -- Al salir de "pendiente_pago" el trigger descuenta el stock
  update public.orders
    set subtotal = v_total, total = v_total, estado = v_estado
    where id = v_order_id;

  return jsonb_build_object('id', v_order_id, 'numero', v_numero, 'total', v_total, 'vendedor', v_vendedor, 'estado', v_estado);
end $$;

revoke execute on function public.registrar_venta_tienda(jsonb, text, text, text, text, text, boolean) from public, anon;
grant execute on function public.registrar_venta_tienda(jsonb, text, text, text, text, text, boolean) to authenticated;

-- Clientes: las ventas por cobrar también cuentan en su historial
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
      from public.orders where estado in ('pagado', 'por_cobrar', 'enviado', 'entregado') and cliente_nombre <> 'Cliente en tienda'
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
    where o.estado in ('pagado', 'por_cobrar', 'enviado', 'entregado') and lower(trim(o.cliente_nombre)) = lower(trim(p_nombre))
    order by 1 desc
    limit 30) x), '[]'::jsonb);
end $$;

revoke execute on function public.buscar_clientes(text), public.historial_cliente(text) from public, anon;
grant execute on function public.buscar_clientes(text), public.historial_cliente(text) to authenticated;

-- ---------------------------------------------------------------------
-- 4. HISTORIAL 2024–2025: solo totales mensuales (de las notas del celular)
-- ---------------------------------------------------------------------
create table if not exists public.ventas_resumen_mensual (
  mes        date primary key check (extract(day from mes) = 1),
  prendas    int not null default 0 check (prendas >= 0),
  ventas     numeric(10,2) not null default 0 check (ventas >= 0),
  origen     text not null default 'notas'
);

revoke all on public.ventas_resumen_mensual from anon;
grant select on public.ventas_resumen_mensual to authenticated;
alter table public.ventas_resumen_mensual enable row level security;
drop policy if exists "Admin ve resumen mensual" on public.ventas_resumen_mensual;
create policy "Admin ve resumen mensual" on public.ventas_resumen_mensual
  for select to authenticated using (public.es_admin_total());

insert into public.ventas_resumen_mensual (mes, prendas, ventas) values
('2024-01-01',12,741.35),
('2024-02-01',29,1660),
('2024-03-01',17,951.45),
('2024-04-01',17,932.84),
('2024-05-01',15,893.98),
('2024-06-01',32,1780),
('2024-07-01',17,1038),
('2024-08-01',11,627),
('2024-09-01',2,120),
('2024-10-01',0,0),
('2024-11-01',2,120),
('2024-12-01',49,2940),
('2025-01-01',20,1200),
('2025-02-01',3,180),
('2025-03-01',1,60),
('2025-04-01',13,780),
('2025-05-01',18,1080),
('2025-06-01',25,1500),
('2025-07-01',17,1020),
('2025-08-01',36,2160),
('2025-09-01',20,1200),
('2025-10-01',2,120),
('2025-11-01',77,5390),
('2025-12-01',94,6580)
on conflict (mes) do update set prendas = excluded.prendas, ventas = excluded.ventas;

-- ---------------------------------------------------------------------
-- 5. BALANCE v3: incluye ventas por cobrar, nombres internos y 2024–2025
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
  aporte_cfg numeric := coalesce((select (valor #>> '{}')::numeric from public.configuracion where clave = 'aporte_por_prenda'), 3);
begin
  if not (public.es_admin_total() or public.es_servicio()) then
    raise exception 'Solo el administrador puede ver el balance.' using errcode = '42501';
  end if;

  select coalesce(p_desde, least(
           (select min(fecha) from public.ventas_historicas),
           (select min(mes) from public.ventas_resumen_mensual),
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
           case when o.estado = 'por_cobrar' then 'por_cobrar' else 'pagado' end,
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
    where o.estado in ('pagado', 'por_cobrar', 'enviado', 'entregado')
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
           coalesce(case when ph.estado in ('automatico', 'confirmado') then coalesce(pr.nombre_interno, pr.nombre) end, ph.nombre, i.nombre_original) as nombre,
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
           coalesce(pr.nombre_interno, pr.nombre, i.nombre),
           i.cantidad, i.subtotal, i.costo_unitario * i.cantidad
    from public.order_items i
    join public.orders o on o.id = i.order_id and o.estado in ('pagado', 'por_cobrar', 'enviado', 'entregado')
    left join public.productos pr on pr.id = i.producto_id
  ),
  l as (select * from lineas where fecha between desde and hasta),

  mensual_detalle as (
    select date_trunc('month', fecha)::date as mes,
           sum(valor) as ventas,
           sum(valor - costo) filter (where costo is not null) as utilidad,
           count(*) as n,
           sum(unidades) as prendas
    from ventas group by 1
  ),
  -- Meses con detalle (Treinta y panel) + meses que solo tienen el total anotado (2024–2025)
  mensual as (
    select mes, ventas, utilidad, n, prendas, 'detalle'::text as fuente from mensual_detalle
    union all
    select r.mes, r.ventas, null, null, r.prendas, 'notas' from public.ventas_resumen_mensual r
    where not exists (select 1 from mensual_detalle d where d.mes = r.mes)
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
      select jsonb_agg(jsonb_build_object('mes', to_char(mes, 'YYYY-MM'), 'ventas', ventas, 'utilidad', utilidad, 'n', n, 'prendas', prendas, 'fuente', fuente) order by mes)
      from mensual where mes between date_trunc('month', desde) and date_trunc('month', hasta)), '[]'::jsonb),

    'comparacion', jsonb_build_object(
      'mes', to_char(mes_ref, 'YYYY-MM'),
      'actual',   (select jsonb_build_object('ventas', coalesce(ventas, 0), 'utilidad', utilidad, 'n', n, 'prendas', prendas, 'fuente', fuente) from (select 1) x left join mensual on mes = mes_ref),
      'anterior', (select jsonb_build_object('ventas', coalesce(ventas, 0), 'utilidad', utilidad, 'n', n, 'prendas', prendas, 'fuente', fuente) from (select 1) x left join mensual on mes = (mes_ref - interval '1 month')::date),
      'anio_anterior', (select jsonb_build_object('ventas', coalesce(ventas, 0), 'utilidad', utilidad, 'n', n, 'prendas', prendas, 'fuente', fuente) from (select 1) x left join mensual on mes = (mes_ref - interval '1 year')::date),
      'hay_anio_anterior', exists (select 1 from mensual where mes <= (mes_ref - interval '1 year')::date)
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
        select coalesce(p.nombre_interno, p.nombre) as nombre, p.sku, coalesce(sum(pt.stock), 0) as stock,
               coalesce((select sum(cantidad) from l where l.prenda_id = p.id::text), 0) as unidades
        from public.productos p
        left join public.producto_tallas pt on pt.producto_id = p.id
        where p.activo
        group by p.id
        having coalesce((select sum(cantidad) from l where l.prenda_id = p.id::text), 0) <= 1
        order by 4 asc, 3 desc
        limit 25) x), '[]'::jsonb),

    -- Totales por año (todo el historial; 2024–2025 vienen de las notas mensuales)
    'anual', coalesce((select jsonb_agg(x order by x.anio) from (
        select extract(year from mes)::int as anio, sum(ventas) as ventas, sum(prendas) as prendas,
               sum(n) as n, sum(utilidad) as utilidad,
               bool_or(fuente = 'notas') as con_notas, count(*) filter (where ventas > 0) as meses
        from mensual group by 1) x), '[]'::jsonb),

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
        select coalesce(p.nombre_interno, p.nombre) as nombre, pt.talla, pt.stock, r.unidades_60d,
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
            join public.orders o on o.id = i.order_id and o.estado in ('pagado', 'por_cobrar', 'enviado', 'entregado')
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
        select coalesce(p.nombre_interno, p.nombre) as nombre, sum(pt.stock) as stock, sum(pt.stock) * coalesce(max(pc.costo), 0) as valor,
               row_number() over (order by sum(pt.stock) * coalesce(max(pc.costo), 0) desc) as rn
        from public.productos p
        join public.producto_tallas pt on pt.producto_id = p.id and pt.talla in ('S', 'M', 'L')
        left join public.productos_costos pc on pc.producto_id = p.id
        where p.activo and not exists (select 1 from l where l.prenda_id = p.id::text)
        group by p.id
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

-- ---------------------------------------------------------------------
-- 6. NOMBRES: el actual pasa a ser el interno; la web usa el nombre limpio.
--    Si ya tenía nombre interno (se ejecutó antes), no se toca.
-- ---------------------------------------------------------------------
drop table if exists _nombres;
create temp table _nombres (sku text, publico text, opcion text, grupo text, slug text);
insert into _nombres values
('BR-UCB8E','Camisa amarilla','Casual','camisa-amarilla','camisa-amarilla-casual-br-ucb8e'),
('BR-RMFCM','Camisa amarilla','Oxford','camisa-amarilla','camisa-amarilla-oxford-br-rmfcm'),
('BR-V6Y86','Camisa azul marino','Casual','camisa-azul-marino','camisa-azul-marino-casual-br-v6y86'),
('BR-CKV4Y','Camisa azul marino','Oxford','camisa-azul-marino','camisa-azul-marino-oxford-br-ckv4y'),
('BR-H6F5E','Camisa azul noche','Casual','camisa-azul-noche','camisa-azul-noche-casual-br-h6f5e'),
('BR-2LZJT','Camisa azul noche','Oxford','camisa-azul-noche','camisa-azul-noche-oxford-br-2lzjt'),
('BR-NLD29','Camisa blanca','Casual','camisa-blanca','camisa-blanca-casual-br-nld29'),
('BR-BKR77','Camisa blanca','Oxford','camisa-blanca','camisa-blanca-oxford-br-bkr77'),
('BR-9QQVW','Camisa blanco hueso','Casual','camisa-blanco-hueso','camisa-blanco-hueso-casual-br-9qqvw'),
('BR-LFRHR','Camisa blanco hueso','Oxford','camisa-blanco-hueso','camisa-blanco-hueso-oxford-br-lfrhr'),
('BR-RGSA7','Camisa celeste','Casual','camisa-celeste','camisa-celeste-casual-br-rgsa7'),
('BR-SYX1X','Camisa celeste','Oxford','camisa-celeste','camisa-celeste-oxford-br-syx1x'),
('BR-2Q2N4','Camisa celeste oscuro','Casual','camisa-celeste-oscuro','camisa-celeste-oscuro-casual-br-2q2n4'),
('BR-H20JW','Camisa celeste oscuro','Oxford','camisa-celeste-oscuro','camisa-celeste-oscuro-oxford-br-h20jw'),
('BR-N8CRZ','Camisa color menta','Casual','camisa-color-menta','camisa-color-menta-casual-br-n8crz'),
('BR-K5KPN','Camisa color menta','Oxford','camisa-color-menta','camisa-color-menta-oxford-br-k5kpn'),
('BR-LR55A','Camisa negra','Casual','camisa-negra','camisa-negra-casual-br-lr55a'),
('BR-Z8TC5','Camisa negra','Oxford','camisa-negra','camisa-negra-oxford-br-z8tc5'),
('BR-M7J1F','Camisa verde','Casual','camisa-verde','camisa-verde-casual-br-m7j1f'),
('BR-NFU9G','Camisa verde','Oxford','camisa-verde','camisa-verde-oxford-br-nfu9g'),
('BR-7VFFK','Camisa rosada','Casual','camisa-rosada','camisa-rosada-casual-br-7vffk'),
('BR-0X3AM','Camisa rosada','Oxford','camisa-rosada','camisa-rosada-oxford-br-0x3am'),
('BR-QAW53','Camisa verde aceituna',null,'camisa-verde-aceituna','camisa-verde-aceituna-br-qaw53'),
('BR-CBLGW','Camisa verde botella','Casual','camisa-verde-botella','camisa-verde-botella-casual-br-cblgw'),
('BR-31J8K','Camisa verde botella','Oxford','camisa-verde-botella','camisa-verde-botella-oxford-br-31j8k'),
('BR-8PCDD','Camisa a rayas rojas','Casual','camisa-a-rayas-rojas','camisa-a-rayas-rojas-casual-br-8pcdd'),
('BR-FFRCJ','Camisa a rayas rojas','Oxford','camisa-a-rayas-rojas','camisa-a-rayas-rojas-oxford-br-ffrcj'),
('BR-56FGT','Camisa a rayas gruesas rosada','Casual','camisa-a-rayas-gruesas-rosada','camisa-a-rayas-gruesas-rosada-casual-br-56fgt'),
('BR-6NE3P','Camisa a rayas gruesas rosada','Oxford','camisa-a-rayas-gruesas-rosada','camisa-a-rayas-gruesas-rosada-oxford-br-6ne3p'),
('BR-LMGBH','Camisa a rayas verde','Casual','camisa-a-rayas-verde','camisa-a-rayas-verde-casual-br-lmgbh'),
('BR-3BE36','Camisa a rayas verde','Oxford','camisa-a-rayas-verde','camisa-a-rayas-verde-oxford-br-3be36'),
('BR-WYP9H','Camisa a rayas verde claro','Oxford','camisa-a-rayas-verde-claro','camisa-a-rayas-verde-claro-oxford-br-wyp9h'),
('BR-74UUX','Camisa rayas amarillas','Oxford','camisa-rayas-amarillas','camisa-rayas-amarillas-oxford-br-74uux'),
('BR-GXSR6','Camisa rayas azules','Casual','camisa-rayas-azules','camisa-rayas-azules-casual-br-gxsr6'),
('BR-TVT4B','Camisa rayas azules','Oxford','camisa-rayas-azules','camisa-rayas-azules-oxford-br-tvt4b'),
('BR-SD6ZB','Camisa rayas celestes','Casual','camisa-rayas-celestes','camisa-rayas-celestes-casual-br-sd6zb'),
('BR-D7A3K','Camisa rayas celestes','Oxford','camisa-rayas-celestes','camisa-rayas-celestes-oxford-br-d7a3k'),
('BR-0BBQD','Camisa rayas plomas','Casual','camisa-rayas-plomas','camisa-rayas-plomas-casual-br-0bbqd'),
('BR-PP4ZQ','Camisa rayas plomas','Oxford','camisa-rayas-plomas','camisa-rayas-plomas-oxford-br-pp4zq'),
('BR-5W83E','Camisa rayas gruesas celeste','Casual','camisa-rayas-gruesas-celeste','camisa-rayas-gruesas-celeste-casual-br-5w83e'),
('BR-J4D7M','Camisa rayas gruesas celeste','Oxford','camisa-rayas-gruesas-celeste','camisa-rayas-gruesas-celeste-oxford-br-j4d7m'),
('BR-1CNH2','Camisa rayas gruesas azul italiano','Casual','camisa-rayas-gruesas-azul-italiano','camisa-rayas-gruesas-azul-italiano-casual-br-1cnh2'),
('BR-NGS9H','Camisa rayas gruesas azul italiano','Oxford','camisa-rayas-gruesas-azul-italiano','camisa-rayas-gruesas-azul-italiano-oxford-br-ngs9h'),
('BR-UPK20','Camisa rayas rojas',null,'camisa-rayas-rojas','camisa-rayas-rojas-br-upk20'),
('BR-JEM4G','Camisa mil rayas rosado','Casual','camisa-mil-rayas-rosado','camisa-mil-rayas-rosado-casual-br-jem4g'),
('BR-KKRWW','Camisa mil rayas rosado','Oxford','camisa-mil-rayas-rosado','camisa-mil-rayas-rosado-oxford-br-kkrww'),
('BR-39CSQ','Camisa rayas finas azul',null,'camisa-rayas-finas-azul','camisa-rayas-finas-azul-br-39csq'),
('BR-56AJC','Camisa rayas finas azul royal','Casual','camisa-rayas-finas-azul-royal','camisa-rayas-finas-azul-royal-casual-br-56ajc'),
('BR-EQ4TN','Camisa rayas finas azul royal','Oxford','camisa-rayas-finas-azul-royal','camisa-rayas-finas-azul-royal-oxford-br-eq4tn'),
('BR-JUU7F','Camisa rayas finas celeste','Casual','camisa-rayas-finas-celeste','camisa-rayas-finas-celeste-casual-br-juu7f'),
('BR-DQWFS','Camisa rayas finas celeste','Oxford','camisa-rayas-finas-celeste','camisa-rayas-finas-celeste-oxford-br-dqwfs'),
('BR-J78C1','Camisa rayas finas rojas','Casual','camisa-rayas-finas-rojas','camisa-rayas-finas-rojas-casual-br-j78c1'),
('BR-32Q7C','Camisa rayas finas rojas','Oxford','camisa-rayas-finas-rojas','camisa-rayas-finas-rojas-oxford-br-32q7c'),
('BR-0F9LQ','Camisa rayas finas rosadas','Casual','camisa-rayas-finas-rosadas','camisa-rayas-finas-rosadas-casual-br-0f9lq'),
('BR-92UQD','Camisa rayas finas rosadas','Oxford','camisa-rayas-finas-rosadas','camisa-rayas-finas-rosadas-oxford-br-92uqd'),
('BR-E6LBE','Camisa rayas finas verde','Casual','camisa-rayas-finas-verde','camisa-rayas-finas-verde-casual-br-e6lbe'),
('BR-KBHGW','Camisa rayas finas verde','Oxford','camisa-rayas-finas-verde','camisa-rayas-finas-verde-oxford-br-kbhgw'),
('BR-UH87R','Camisa a cuadros azul royal','Casual','camisa-a-cuadros-azul-royal','camisa-a-cuadros-azul-royal-casual-br-uh87r'),
('BR-XRLKP','Camisa a cuadros azul royal','Oxford','camisa-a-cuadros-azul-royal','camisa-a-cuadros-azul-royal-oxford-br-xrlkp'),
('BR-HTSC0','Camisa a cuadros celestes','Casual','camisa-a-cuadros-celestes','camisa-a-cuadros-celestes-casual-br-htsc0'),
('BR-N9GXY','Camisa a cuadros celestes','Oxford','camisa-a-cuadros-celestes','camisa-a-cuadros-celestes-oxford-br-n9gxy'),
('BR-34GJW','Camisa a cuadros rosados','Casual','camisa-a-cuadros-rosados','camisa-a-cuadros-rosados-casual-br-34gjw'),
('BR-S5UA1','Camisa a cuadros rosados','Oxford','camisa-a-cuadros-rosados','camisa-a-cuadros-rosados-oxford-br-s5ua1'),
('BR-6EGWH','Camisa a cuadros verde','Casual','camisa-a-cuadros-verde','camisa-a-cuadros-verde-casual-br-6egwh'),
('BR-9Q3VN','Camisa a cuadros verde','Oxford','camisa-a-cuadros-verde','camisa-a-cuadros-verde-oxford-br-9q3vn'),
('BR-5YF3T','Camisa cuadros azul noche','Casual','camisa-cuadros-azul-noche','camisa-cuadros-azul-noche-casual-br-5yf3t'),
('BR-85D6K','Camisa cuadros azul noche','Oxford','camisa-cuadros-azul-noche','camisa-cuadros-azul-noche-oxford-br-85d6k'),
('BR-16ME0','Camisa cuadros salmón',null,'camisa-cuadros-salmon','camisa-cuadros-salmon-br-16me0'),
('BR-GW0FH','Camisa de lino celeste',null,'camisa-de-lino-celeste','camisa-de-lino-celeste-br-gw0fh'),
('BR-QVSVN','Camisa de lino amarillo maíz',null,'camisa-de-lino-amarillo-maiz','camisa-de-lino-amarillo-maiz-br-qvsvn'),
('BR-VPJHT','Camisa de lino beige',null,'camisa-de-lino-beige','camisa-de-lino-beige-br-vpjht'),
('BR-H2BPE','Camisa de lino blanco',null,'camisa-de-lino-blanco','camisa-de-lino-blanco-br-h2bpe'),
('BR-YL75T','Camisa de lino rosado',null,'camisa-de-lino-rosado','camisa-de-lino-rosado-br-yl75t'),
('BR-33Y36','Camisa de lino negro',null,'camisa-de-lino-negro','camisa-de-lino-negro-br-33y36'),
('BR-7M2UD','Camisa azul marino','Casual','camisa-azul-marino','camisa-azul-marino-casual-br-7m2ud'),
('BR-Y7JE0','Camisa azul marino','Oxford','camisa-azul-marino','camisa-azul-marino-oxford-br-y7je0'),
('BR-2FVC8','Camisa blanca','Casual','camisa-blanca','camisa-blanca-casual-br-2fvc8'),
('BR-7A2DM','Camisa blanca','Oxford','camisa-blanca','camisa-blanca-oxford-br-7a2dm'),
('BR-C0743','Camisa celeste caspeado','Casual','camisa-celeste-caspeado','camisa-celeste-caspeado-casual-br-c0743'),
('BR-74WLB','Camisa celeste caspeado','Oxford','camisa-celeste-caspeado','camisa-celeste-caspeado-oxford-br-74wlb'),
('BR-25VEB','Camisa celeste','Casual','camisa-celeste','camisa-celeste-casual-br-25veb'),
('BR-D9JXK','Camisa celeste','Oxford','camisa-celeste','camisa-celeste-oxford-br-d9jxk'),
('BR-3A3ZU','Camisa Lacoste',null,'camisa-lacoste','camisa-lacoste-br-3a3zu'),
('BR-WBK38','Blazer azul',null,'blazer-azul','blazer-azul-br-wbk38'),
('BR-2FKWR','Blazer negro',null,'blazer-negro','blazer-negro-br-2fkwr'),
('BR-DHGGD','Chaqueta 2 bolsillos azul',null,'chaqueta-2-bolsillos-azul','chaqueta-2-bolsillos-azul-br-dhggd'),
('BR-U5LZA','Chaqueta 2 bolsillos chocolate',null,'chaqueta-2-bolsillos-chocolate','chaqueta-2-bolsillos-chocolate-br-u5lza'),
('BR-UT8G6','Chaqueta 2 bolsillos verde olivo',null,'chaqueta-2-bolsillos-verde-olivo','chaqueta-2-bolsillos-verde-olivo-br-ut8g6'),
('BR-WW3Z6','Chaqueta 3 bolsillos azul',null,'chaqueta-3-bolsillos-azul','chaqueta-3-bolsillos-azul-br-ww3z6'),
('BR-2BNYP','Chaqueta 3 bolsillos chocolate',null,'chaqueta-3-bolsillos-chocolate','chaqueta-3-bolsillos-chocolate-br-2bnyp'),
('BR-TQ82L','Chaqueta 4 bolsillos café',null,'chaqueta-4-bolsillos-cafe','chaqueta-4-bolsillos-cafe-br-tq82l'),
('BR-ZSKN2','Chaqueta acolchada 4 bolsillos',null,'chaqueta-acolchada-4-bolsillos','chaqueta-acolchada-4-bolsillos-br-zskn2'),
('BR-D8JZ7','Chaqueta acolchada azul',null,'chaqueta-acolchada-azul','chaqueta-acolchada-azul-br-d8jz7'),
('BR-Y2EGR','Chaqueta acolchada negra',null,'chaqueta-acolchada-negra','chaqueta-acolchada-negra-br-y2egr'),
('BR-EHN1Y','Chaqueta gabardina azul',null,'chaqueta-gabardina-azul','chaqueta-gabardina-azul-br-ehn1y'),
('BR-PFN0Q','Chaqueta Harrington azul',null,'chaqueta-harrington-azul','chaqueta-harrington-azul-br-pfn0q'),
('BR-YZNV8','Chaqueta Harrington beige',null,'chaqueta-harrington-beige','chaqueta-harrington-beige-br-yznv8'),
('BR-H1KF7','Chaqueta acolchada negra',null,'chaqueta-acolchada-negra','chaqueta-acolchada-negra-br-h1kf7'),
('BR-3LKVQ','Chaqueta Ralph Lauren negra',null,'chaqueta-ralph-lauren-negra','chaqueta-ralph-lauren-negra-br-3lkvq'),
('BR-J6GBQ','Saco Ralph Lauren azul marino',null,'saco-ralph-lauren-azul-marino','saco-ralph-lauren-azul-marino-br-j6gbq'),
('BR-D8JWH','Saco azul oso con gorra',null,'saco-azul-oso-con-gorra','saco-azul-oso-con-gorra-br-d8jwh'),
('BR-6UG4M','Saco bandera azul',null,'saco-bandera-azul','saco-bandera-azul-br-6ug4m'),
('BR-UB6FH','Saco blanco oso con faro',null,'saco-blanco-oso-con-faro','saco-blanco-oso-con-faro-br-ub6fh'),
('BR-50DER','Saco de lana blanco oso con taza',null,'saco-de-lana-blanco-oso-con-taza','saco-de-lana-blanco-oso-con-taza-br-50der'),
('BR-PZR66','Saco de oso abuelo',null,'saco-de-oso-abuelo','saco-de-oso-abuelo-br-pzr66'),
('BR-75H6T','Saco Estados Unidos blanco',null,'saco-estados-unidos-blanco','saco-estados-unidos-blanco-br-75h6t'),
('BR-ZM1TR','Saco oso palos de golf azul',null,'saco-oso-palos-de-golf-azul','saco-oso-palos-de-golf-azul-br-zm1tr'),
('BR-VZMBN','Saco trenzado blanco hueso',null,'saco-trenzado-blanco-hueso','saco-trenzado-blanco-hueso-br-vzmbn'),
('BR-354G6','Saco verde oso universitario',null,'saco-verde-oso-universitario','saco-verde-oso-universitario-br-354g6'),
('BR-GHTN6','Buzo medio cierre Ralph Lauren azul',null,'buzo-medio-cierre-ralph-lauren-azul','buzo-medio-cierre-ralph-lauren-azul-br-ghtn6'),
('BR-Y2R22','Buzo medio cierre Ralph Lauren gris',null,'buzo-medio-cierre-ralph-lauren-gris','buzo-medio-cierre-ralph-lauren-gris-br-y2r22'),
('BR-FZFRM','Camisa polo azul quemada',null,'camisa-polo-azul-quemada','camisa-polo-azul-quemada-br-fzfrm'),
('BR-8PYQ5','Polo Boss azul',null,'polo-boss-azul','polo-boss-azul-br-8pyq5');

update public.productos p set
  nombre_interno = coalesce(p.nombre_interno, p.nombre),
  nombre = n.publico,
  opcion = n.opcion,
  grupo = n.grupo,
  slug = n.slug
from _nombres n
where p.sku = n.sku and p.nombre_interno is null;

-- Prendas creadas después (sin nombre interno): el interno es el mismo nombre
update public.productos set nombre_interno = nombre where nombre_interno is null;
update public.productos set grupo = sku where grupo is null;

drop table if exists _nombres;

-- ---------------------------------------------------------------------
-- 7. VUELVEN BÁSICAS Y POLOS (solo panel: van en categorías ocultas para la web)
-- ---------------------------------------------------------------------
insert into public.categorias (nombre, slug, orden, visible) values
  ('Básicas', 'basicas', 50, false),
  ('Polos', 'polos', 51, false)
on conflict (slug) do update set visible = false;

insert into public.categorias (nombre, slug, orden, visible, parent_id) values
  ('Lacoste', 'polos-lacoste', 1, false, (select id from public.categorias where slug = 'polos')),
  ('Ralph Lauren', 'polos-ralph-lauren', 2, false, (select id from public.categorias where slug = 'polos'))
on conflict (slug) do update set visible = false, parent_id = excluded.parent_id;

drop table if exists _vuelven;
create temp table _vuelven (sku text, interno text, publico text, grupo text, slug text, categoria text,
  precio numeric, costo numeric, s int, m int, l int);
insert into _vuelven values
('BR-VWR1F','Basica amarilla','Camiseta básica amarilla','camiseta-basica-amarilla','camiseta-basica-amarilla-br-vwr1f','basicas',25.0,13.0,0,0,0),
('BR-PJZ2Z','Basica azul marino','Camiseta básica azul marino','camiseta-basica-azul-marino','camiseta-basica-azul-marino-br-pjz2z','basicas',25.0,12.0,0,0,0),
('BR-ZGL1E','Basica negra','Camiseta básica negra','camiseta-basica-negra','camiseta-basica-negra-br-zgl1e','basicas',25.0,12.0,0,0,0),
('BR-0C3PD','Camiseta basica azul petróleo','Camiseta básica azul petróleo','camiseta-basica-azul-petroleo','camiseta-basica-azul-petroleo-br-0c3pd','basicas',25.0,12.0,0,0,0),
('BR-JYVHP','Camiseta basica blanca','Camiseta básica blanca','camiseta-basica-blanca','camiseta-basica-blanca-br-jyvhp','basicas',25.0,12.0,0,0,0),
('BR-NSRYD','Camiseta basica ploma','Camiseta básica ploma','camiseta-basica-ploma','camiseta-basica-ploma-br-nsryd','basicas',25.0,12.0,0,0,0),
('BR-5DJJH','Camiseta basica verde','Camiseta básica verde','camiseta-basica-verde','camiseta-basica-verde-br-5djjh','basicas',25.0,12.0,0,0,0),
('BR-JJ0S0','Lacoste Café claro','Polo Lacoste café claro','polo-lacoste-cafe-claro','polo-lacoste-cafe-claro-br-jj0s0','polos-lacoste',50.0,13.0,0,0,1),
('BR-EPMWE','Polo amarillo bebé','Polo Ralph Lauren amarillo bebé','polo-ralph-lauren-amarillo-bebe','polo-ralph-lauren-amarillo-bebe-br-epmwe','polos-ralph-lauren',65.0,22.0,0,2,0),
('BR-H5MCQ','Polo azul acero','Polo Ralph Lauren azul acero','polo-ralph-lauren-azul-acero','polo-ralph-lauren-azul-acero-br-h5mcq','polos-ralph-lauren',65.0,22.0,0,1,2),
('BR-V3KSE','Polo azul marino','Polo Ralph Lauren azul marino','polo-ralph-lauren-azul-marino','polo-ralph-lauren-azul-marino-br-v3kse','polos-ralph-lauren',65.0,22.0,1,1,1),
('BR-RYURW','Polo azul noche','Polo Ralph Lauren azul noche','polo-ralph-lauren-azul-noche','polo-ralph-lauren-azul-noche-br-ryurw','polos-ralph-lauren',65.0,22.0,2,0,3),
('BR-NYPLB','Polo Blanca','Polo Lacoste blanco','polo-lacoste-blanco','polo-lacoste-blanco-br-nyplb','polos-lacoste',50.0,13.0,0,0,1),
('BR-KU9Y3','Polo blanca PRL','Polo Ralph Lauren blanco','polo-ralph-lauren-blanco','polo-ralph-lauren-blanco-br-ku9y3','polos-ralph-lauren',65.0,22.0,7,0,4),
('BR-L2E1S','Polo celeste','Polo Ralph Lauren celeste','polo-ralph-lauren-celeste','polo-ralph-lauren-celeste-br-l2e1s','polos-ralph-lauren',65.0,22.0,0,2,1),
('BR-SWGGE','Polo coral','Polo Ralph Lauren coral','polo-ralph-lauren-coral','polo-ralph-lauren-coral-br-swgge','polos-ralph-lauren',65.0,22.0,0,1,0),
('BR-JNF4J','Polo gris','Polo Lacoste gris','polo-lacoste-gris','polo-lacoste-gris-br-jnf4j','polos-lacoste',50.0,13.0,0,0,1),
('BR-DW909','Polo Lacoste Negra','Polo Lacoste negro','polo-lacoste-negro','polo-lacoste-negro-br-dw909','polos-lacoste',50.0,13.0,1,0,0),
('BR-TKA8R','Polo menta PRL','Polo Ralph Lauren menta','polo-ralph-lauren-menta','polo-ralph-lauren-menta-br-tka8r','polos-ralph-lauren',65.0,22.0,0,0,0),
('BR-NWE5E','Polo negra PRL','Polo Ralph Lauren negro','polo-ralph-lauren-negro','polo-ralph-lauren-negro-br-nwe5e','polos-ralph-lauren',65.0,22.0,0,1,2),
('BR-LUP6E','Polo ploma','Polo Ralph Lauren plomo','polo-ralph-lauren-plomo','polo-ralph-lauren-plomo-br-lup6e','polos-ralph-lauren',60.0,22.0,2,1,1),
('BR-5MELM','Polo roja PRL','Polo Ralph Lauren rojo','polo-ralph-lauren-rojo','polo-ralph-lauren-rojo-br-5melm','polos-ralph-lauren',65.0,22.0,0,0,0),
('BR-ZLPSS','Polo rosada PRL','Polo Ralph Lauren rosado','polo-ralph-lauren-rosado','polo-ralph-lauren-rosado-br-zlpss','polos-ralph-lauren',65.0,22.0,0,3,0),
('BR-KS5XN','Polo Turquesa','Polo Ralph Lauren turquesa','polo-ralph-lauren-turquesa','polo-ralph-lauren-turquesa-br-ks5xn','polos-ralph-lauren',60.0,22.0,1,3,0),
('BR-AVEHH','Polo verde PRL','Polo Ralph Lauren verde','polo-ralph-lauren-verde','polo-ralph-lauren-verde-br-avehh','polos-ralph-lauren',65.0,22.0,0,2,0),
('BR-BB6C6','Polo Vino','Polo Ralph Lauren vino','polo-ralph-lauren-vino','polo-ralph-lauren-vino-br-bb6c6','polos-ralph-lauren',60.0,22.0,0,0,0),
('BR-71RN2','Tommy blanca básica','Camiseta básica Tommy blanca','camiseta-basica-tommy-blanca','camiseta-basica-tommy-blanca-br-71rn2','basicas',25.0,12.0,0,0,0),
('BR-27D29','Tommy negra básica','Camiseta básica Tommy negra','camiseta-basica-tommy-negra','camiseta-basica-tommy-negra-br-27d29','basicas',25.0,12.0,0,0,0);

-- Si ya existen (se ejecutó antes), no se cambian ni su stock ni su precio
insert into public.productos (sku, nombre, nombre_interno, grupo, slug, precio, categoria_id, activo)
select v.sku, v.publico, v.interno, v.grupo, v.slug, v.precio, c.id, true
from _vuelven v join public.categorias c on c.slug = v.categoria
on conflict (sku) do nothing;

insert into public.producto_tallas (producto_id, talla, stock)
select p.id, t.talla, t.stock
from _vuelven v
join public.productos p on p.sku = v.sku
cross join lateral (values ('S', v.s), ('M', v.m), ('L', v.l)) as t(talla, stock)
on conflict (producto_id, talla) do nothing;

insert into public.productos_costos (producto_id, costo)
select p.id, v.costo from _vuelven v join public.productos p on p.sku = v.sku
on conflict (producto_id) do nothing;

drop table if exists _vuelven;

-- ---------------------------------------------------------------------
-- 8. Revisión
-- ---------------------------------------------------------------------
select (select count(*) from public.productos) as productos,
       (select count(distinct p.grupo) from public.productos p left join public.categorias c on c.id = p.categoria_id
         where p.activo and coalesce(c.visible, true)) as modelos_en_la_web,
       (select count(*) from public.productos p join public.categorias c on c.id = p.categoria_id
         where c.slug in ('basicas', 'polos-lacoste', 'polos-ralph-lauren')) as basicas_y_polos,
       (select sum(stock) from public.producto_tallas pt join public.productos p on p.id = pt.producto_id
          join public.categorias c on c.id = p.categoria_id
         where c.slug in ('basicas', 'polos-lacoste', 'polos-ralph-lauren')) as prendas_que_vuelven,
       (select sum(ventas) from public.ventas_resumen_mensual where mes < '2025-01-01') as total_2024,
       (select sum(ventas) from public.ventas_resumen_mensual where mes >= '2025-01-01' and mes < '2026-01-01') as total_2025;
