-- =====================================================================
-- BRUNEL BRAND · FASE 3: ventas en tienda, vendedores y roles, costos,
-- stock bajo, contador de pedidos entregados y dashboard.
-- Requisitos: esquema.sql, fase2.sql (y subcategorias.sql) ya ejecutados.
-- Pega TODO en Supabase > SQL Editor > Run. Se puede ejecutar más de una vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ROLES DEL EQUIPO
--    admin    = ve y hace todo (costos, dashboard, configuración)
--    vendedor = vende, ve productos y pedidos; NO ve costos ni dashboard
-- ---------------------------------------------------------------------
alter table public.admins add column if not exists nombre text;
alter table public.admins add column if not exists rol text not null default 'admin';
do $$ begin
  alter table public.admins add constraint admins_rol_check check (rol in ('admin', 'vendedor'));
exception when duplicate_object then null; end $$;

-- es_admin() (ya existe) = cualquier persona del equipo (admin o vendedor)
-- es_admin_total() = solo rol admin
create or replace function public.es_admin_total()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid() and rol = 'admin');
$$;

-- Nombre y rol del usuario con sesión (para el panel)
create or replace function public.mi_rol()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'rol', a.rol,
    'nombre', coalesce(a.nombre, split_part(u.email, '@', 1))
  )
  from public.admins a join auth.users u on u.id = a.user_id
  where a.user_id = auth.uid();
$$;

grant execute on function public.es_admin_total(), public.mi_rol() to authenticated;

-- ---------------------------------------------------------------------
-- 2. VENTAS WEB Y DE TIENDA EN LAS MISMAS TABLAS
-- ---------------------------------------------------------------------
alter table public.orders add column if not exists canal text not null default 'web';
alter table public.orders add column if not exists vendedor_id uuid references auth.users(id) on delete set null;
alter table public.orders add column if not exists vendedor_nombre text;
alter table public.orders add column if not exists metodo_pago text;
do $$ begin
  alter table public.orders add constraint orders_canal_check check (canal in ('web', 'tienda'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.orders add constraint orders_metodo_pago_check
    check (metodo_pago is null or metodo_pago in ('payphone', 'efectivo', 'transferencia', 'tarjeta'));
exception when duplicate_object then null; end $$;

update public.orders set metodo_pago = 'payphone' where canal = 'web' and metodo_pago is null;

create index if not exists orders_canal_fecha_idx on public.orders (canal, pagado_en);
create index if not exists orders_vendedor_idx on public.orders (vendedor_id);

-- Costo de cada prenda al momento de la venta (para calcular utilidad)
alter table public.order_items add column if not exists costo_unitario numeric(10,2);

-- La columna de costo no se puede leer desde el navegador (solo vía funciones de admin)
revoke select on public.order_items from anon, authenticated;
grant select (id, order_id, producto_id, sku, nombre, talla, imagen, precio_unitario, cantidad, subtotal)
  on public.order_items to authenticated;

-- ---------------------------------------------------------------------
-- 3. COSTO POR PRODUCTO (solo admin)
-- ---------------------------------------------------------------------
create table if not exists public.productos_costos (
  producto_id     uuid primary key references public.productos(id) on delete cascade,
  costo           numeric(10,2) not null check (costo >= 0),
  actualizado_en  timestamptz not null default now()
);

drop trigger if exists productos_costos_actualizado_en on public.productos_costos;
create trigger productos_costos_actualizado_en before update on public.productos_costos
  for each row execute function public.tocar_actualizado_en();

-- ---------------------------------------------------------------------
-- 4. CONFIGURACIÓN (umbral de stock bajo, correo semanal)
-- ---------------------------------------------------------------------
create table if not exists public.configuracion (
  clave           text primary key,
  valor           jsonb not null,
  actualizado_en  timestamptz not null default now()
);

drop trigger if exists configuracion_actualizado_en on public.configuracion;
create trigger configuracion_actualizado_en before update on public.configuracion
  for each row execute function public.tocar_actualizado_en();

insert into public.configuracion (clave, valor) values
  ('umbral_stock', '2'::jsonb),
  ('correo_reposicion', '{"activo": true, "solo_activos": true}'::jsonb)
on conflict (clave) do nothing;

-- ---------------------------------------------------------------------
-- 5. CONTADOR PÚBLICO DE PEDIDOS ENTREGADOS (dato real, sin cifras inventadas)
-- ---------------------------------------------------------------------
create or replace function public.pedidos_entregados()
returns bigint language sql stable security definer set search_path = public as $$
  select count(*) from public.orders where estado = 'entregado';
$$;
grant execute on function public.pedidos_entregados() to anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. REGISTRAR VENTA EN TIENDA (todo o nada)
--    - El vendedor sale del usuario con sesión iniciada.
--    - Valida stock con bloqueo de filas; si falta stock, no guarda nada.
--    - El pedido queda "entregado" y el trigger descuenta el stock.
--    p_items: [{"productoId": "...", "talla": "M", "cantidad": 1, "precio": 75}]
-- ---------------------------------------------------------------------
create or replace function public.registrar_venta_tienda(
  p_items jsonb,
  p_metodo_pago text,
  p_cliente_nombre text default null,
  p_cliente_telefono text default null,
  p_notas text default null
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
begin
  if not public.es_admin() then
    raise exception 'No tienes permiso para registrar ventas.' using errcode = '42501';
  end if;
  if p_metodo_pago is null or p_metodo_pago not in ('efectivo', 'transferencia', 'tarjeta') then
    raise exception 'Elige un método de pago válido.';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'La venta no tiene productos.';
  end if;

  -- Validar cantidades, precios y stock (sumando líneas repetidas)
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
    select nombre into v_prod from public.productos where id = v_linea.producto_id;
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

  insert into public.orders (
    canal, vendedor_id, vendedor_nombre, metodo_pago, estado,
    cliente_nombre, cliente_correo, cliente_telefono,
    provincia, ciudad, sector, direccion,
    envio_metodo, envio_nombre, costo_envio, subtotal, total,
    notas_internas, correos_enviados
  ) values (
    'tienda', auth.uid(), v_vendedor, p_metodo_pago, 'pendiente_pago',
    coalesce(nullif(trim(p_cliente_nombre), ''), 'Cliente en tienda'), '-',
    coalesce(nullif(trim(p_cliente_telefono), ''), '-'),
    'Pichincha', 'Quito', 'Tienda', 'Venta en tienda',
    'tienda', 'Venta en tienda', 0, 0, 0,
    nullif(trim(p_notas), ''), true
  )
  returning id, numero into v_order_id, v_numero;

  insert into public.order_items
    (order_id, producto_id, sku, nombre, talla, imagen, precio_unitario, cantidad, subtotal, costo_unitario)
  select v_order_id, p.id, p.sku, p.nombre, upper(e->>'talla'), p.imagenes[1],
         round((e->>'precio')::numeric, 2),
         (e->>'cantidad')::int,
         round((e->>'precio')::numeric * (e->>'cantidad')::int, 2),
         c.costo
  from jsonb_array_elements(p_items) e
  join public.productos p on p.id = (e->>'productoId')::uuid
  left join public.productos_costos c on c.producto_id = p.id;

  select coalesce(sum(subtotal), 0) into v_total from public.order_items where order_id = v_order_id;

  -- Al pasar a "entregado" el trigger orders_aplicar_stock descuenta el stock
  update public.orders
    set subtotal = v_total, total = v_total, estado = 'entregado'
    where id = v_order_id;

  return jsonb_build_object('id', v_order_id, 'numero', v_numero, 'total', v_total, 'vendedor', v_vendedor);
end $$;

revoke execute on function public.registrar_venta_tienda(jsonb, text, text, text, text) from public, anon;
grant execute on function public.registrar_venta_tienda(jsonb, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 7. DASHBOARD (solo rol admin). Fechas en hora de Ecuador.
-- ---------------------------------------------------------------------
create or replace function public.dashboard_datos()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
declare
  tz constant text := 'America/Guayaquil';
  hoy date := (now() at time zone tz)::date;
  inicio_semana date := date_trunc('week', (now() at time zone tz))::date;
  inicio_mes date := date_trunc('month', (now() at time zone tz))::date;
  resultado jsonb;
begin
  if not public.es_admin_total() then
    raise exception 'Solo el administrador puede ver el dashboard.' using errcode = '42501';
  end if;

  with ventas as (
    select o.id, o.canal, o.total,
           coalesce(o.vendedor_nombre, case when o.canal = 'web' then 'Tienda online' else 'Sin vendedor' end) as vendedor,
           (coalesce(o.pagado_en, o.creado_en) at time zone tz) as fecha
    from public.orders o
    where o.estado in ('pagado', 'enviado', 'entregado')
  ),
  lineas as (
    select i.*, v.fecha, v.canal
    from public.order_items i join ventas v on v.id = i.order_id
  )
  select jsonb_build_object(
    'hoy', hoy,

    -- Ranking por vendedor: hoy, semana y mes
    'vendedores', coalesce((
      select jsonb_agg(x order by x.mes_total desc) from (
        select vendedor,
          coalesce(sum(total) filter (where fecha::date = hoy), 0)            as dia_total,
          count(*)            filter (where fecha::date = hoy)                 as dia_ventas,
          coalesce(sum(total) filter (where fecha::date >= inicio_semana), 0)  as semana_total,
          count(*)            filter (where fecha::date >= inicio_semana)      as semana_ventas,
          coalesce(sum(total) filter (where fecha::date >= inicio_mes), 0)     as mes_total,
          count(*)            filter (where fecha::date >= inicio_mes)         as mes_ventas
        from ventas group by vendedor
      ) x
    ), '[]'::jsonb),

    -- Ventas por día y vendedor (últimos 14 días)
    'por_dia', coalesce((
      select jsonb_agg(jsonb_build_object('fecha', fecha::date, 'vendedor', vendedor, 'total', total) order by fecha)
      from (
        select fecha::date as fecha, vendedor, sum(total) as total
        from ventas where fecha::date > hoy - 14
        group by 1, 2
      ) d
    ), '[]'::jsonb),

    -- Ventas y utilidad por mes (últimos 12 meses)
    'por_mes', coalesce((
      select jsonb_agg(m order by m.mes) from (
        select to_char(meses.mes, 'YYYY-MM') as mes,
          coalesce((select sum(v.total) from ventas v where date_trunc('month', v.fecha) = meses.mes), 0) as ventas,
          coalesce((select count(*) from ventas v where date_trunc('month', v.fecha) = meses.mes), 0) as pedidos,
          coalesce((select sum(l.subtotal - l.costo_unitario * l.cantidad) from lineas l
                    where date_trunc('month', l.fecha) = meses.mes and l.costo_unitario is not null), 0) as utilidad,
          coalesce((select sum(l.subtotal) from lineas l
                    where date_trunc('month', l.fecha) = meses.mes and l.costo_unitario is null), 0) as ventas_sin_costo,
          coalesce((select sum(v.total) from ventas v where date_trunc('month', v.fecha) = meses.mes and v.canal = 'web'), 0) as web,
          coalesce((select sum(v.total) from ventas v where date_trunc('month', v.fecha) = meses.mes and v.canal = 'tienda'), 0) as tienda
        from generate_series(date_trunc('month', inicio_mes - interval '11 months'), inicio_mes, interval '1 month') as meses(mes)
      ) m
    ), '[]'::jsonb),

    -- Más vendidos (últimos 30 días)
    'top_productos', coalesce((
      select jsonb_agg(t) from (
        select l.sku, l.nombre, sum(l.cantidad) as unidades, sum(l.subtotal) as total
        from lineas l where l.fecha::date > hoy - 30
        group by l.sku, l.nombre
        order by unidades desc, total desc
        limit 10
      ) t
    ), '[]'::jsonb),

    -- Con stock pero sin ventas en 30 días
    'sin_ventas', coalesce((
      select jsonb_agg(s) from (
        select p.sku, p.nombre, sum(pt.stock) as stock
        from public.productos p
        join public.producto_tallas pt on pt.producto_id = p.id
        where p.activo
          and not exists (
            select 1 from lineas l where l.producto_id = p.id and l.fecha::date > hoy - 30
          )
        group by p.id, p.sku, p.nombre
        having sum(pt.stock) > 0
        order by sum(pt.stock) desc
        limit 30
      ) s
    ), '[]'::jsonb),

    -- Online vs tienda (mes actual)
    'canales_mes', coalesce((
      select jsonb_agg(c) from (
        select canal, sum(total) as total, count(*) as ventas
        from ventas where fecha::date >= inicio_mes group by canal
      ) c
    ), '[]'::jsonb)
  ) into resultado;

  return resultado;
end $$;

revoke execute on function public.dashboard_datos() from public, anon;
grant execute on function public.dashboard_datos() to authenticated;

-- ---------------------------------------------------------------------
-- 8. PERMISOS Y RLS DE LAS TABLAS NUEVAS
-- ---------------------------------------------------------------------
grant select, insert, update, delete on public.productos_costos to authenticated;
grant select, insert, update on public.configuracion to authenticated;

alter table public.productos_costos enable row level security;
alter table public.configuracion    enable row level security;

-- Costos: solo rol admin (lectura y escritura)
drop policy if exists "Admin ve costos" on public.productos_costos;
create policy "Admin ve costos" on public.productos_costos
  for select to authenticated using (public.es_admin_total());
drop policy if exists "Admin crea costos" on public.productos_costos;
create policy "Admin crea costos" on public.productos_costos
  for insert to authenticated with check (public.es_admin_total());
drop policy if exists "Admin edita costos" on public.productos_costos;
create policy "Admin edita costos" on public.productos_costos
  for update to authenticated using (public.es_admin_total()) with check (public.es_admin_total());
drop policy if exists "Admin borra costos" on public.productos_costos;
create policy "Admin borra costos" on public.productos_costos
  for delete to authenticated using (public.es_admin_total());

-- Configuración: el equipo la lee; solo el admin la cambia
drop policy if exists "Equipo ve configuracion" on public.configuracion;
create policy "Equipo ve configuracion" on public.configuracion
  for select to authenticated using (public.es_admin());
drop policy if exists "Admin crea configuracion" on public.configuracion;
create policy "Admin crea configuracion" on public.configuracion
  for insert to authenticated with check (public.es_admin_total());
drop policy if exists "Admin edita configuracion" on public.configuracion;
create policy "Admin edita configuracion" on public.configuracion
  for update to authenticated using (public.es_admin_total()) with check (public.es_admin_total());

-- Los pedidos, productos y stock siguen usando es_admin() (todo el equipo).

-- =====================================================================
-- 9. TU EQUIPO  (cambia los correos y ejecuta estas líneas al final)
--    Primero crea el usuario de Mateo en Authentication > Users > Add user.
--
-- insert into public.admins (user_id, nombre, rol)
-- select id, 'Santiago', 'admin' from auth.users where email = 'CORREO_DE_SANTIAGO'
-- on conflict (user_id) do update set nombre = excluded.nombre, rol = excluded.rol;
--
-- insert into public.admins (user_id, nombre, rol)
-- select id, 'Mateo', 'admin' from auth.users where email = 'CORREO_DE_MATEO'
-- on conflict (user_id) do update set nombre = excluded.nombre, rol = excluded.rol;
--
-- (Para un futuro vendedor sin acceso a costos ni dashboard, usa rol 'vendedor'.)
-- =====================================================================
