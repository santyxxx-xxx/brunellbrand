import json, re, unicodedata
R='/home/claude/brunelbrand/'
f4=open(R+'supabase/fase4.sql').read()
def bloque(texto, inicio, fin):
    i=texto.index(inicio); j=texto.index(fin, i)+len(fin); return texto[i:j]
cli=bloque(f4,'create or replace function public.buscar_clientes','grant execute on function public.buscar_clientes(text), public.historial_cliente(text) to authenticated;')
bal=bloque(f4,'create or replace function public.balance_datos','grant execute on function public.balance_datos(date, date) to authenticated, service_role;')
EST="estado in ('pagado', 'enviado', 'entregado')"; EST2="estado in ('pagado', 'por_cobrar', 'enviado', 'entregado')"
cli=cli.replace(EST,EST2)
cli=cli.replace("select h.fecha, 'Treinta' as origen","select h.fecha, 'Treinta' as origen")
def rep(s,a,b,n=1):
    assert s.count(a)>=n, a; return s.replace(a,b)
bal=rep(bal,EST,EST2)
bal=rep(bal,"""           'pagado',
           o.total,""","""           case when o.estado = 'por_cobrar' then 'por_cobrar' else 'pagado' end,
           o.total,""")
bal=rep(bal,"then pr.nombre end","then coalesce(pr.nombre_interno, pr.nombre) end")
bal=rep(bal,"coalesce(pr.nombre, i.nombre)","coalesce(pr.nombre_interno, pr.nombre, i.nombre)")
bal=rep(bal,"select p.nombre, p.sku, coalesce(sum(pt.stock), 0) as stock","select coalesce(p.nombre_interno, p.nombre) as nombre, p.sku, coalesce(sum(pt.stock), 0) as stock")
bal=rep(bal,"group by p.id, p.nombre, p.sku","group by p.id")
bal=rep(bal,"select p.nombre, pt.talla, pt.stock, r.unidades_60d","select coalesce(p.nombre_interno, p.nombre) as nombre, pt.talla, pt.stock, r.unidades_60d")
bal=rep(bal,"select p.nombre, sum(pt.stock) as stock, sum(pt.stock) * coalesce(max(pc.costo), 0) as valor","select coalesce(p.nombre_interno, p.nombre) as nombre, sum(pt.stock) as stock, sum(pt.stock) * coalesce(max(pc.costo), 0) as valor")
bal=rep(bal,"group by p.id, p.nombre\n","group by p.id\n")
bal=rep(bal,"""           (select min(fecha) from public.ventas_historicas),""","""           (select min(fecha) from public.ventas_historicas),
           (select min(mes) from public.ventas_resumen_mensual),""")
bal=rep(bal,"""  mensual as (
    select date_trunc('month', fecha)::date as mes,
           sum(valor) as ventas,
           sum(valor - costo) filter (where costo is not null) as utilidad,
           count(*) as n
    from ventas group by 1
  ),""","""  mensual_detalle as (
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
  ),""")
bal=rep(bal,"""jsonb_build_object('mes', to_char(mes, 'YYYY-MM'), 'ventas', ventas, 'utilidad', coalesce(utilidad, 0), 'n', n)""",
"""jsonb_build_object('mes', to_char(mes, 'YYYY-MM'), 'ventas', ventas, 'utilidad', utilidad, 'n', n, 'prendas', prendas, 'fuente', fuente)""")
for k in ('actual','anterior','anio_anterior'):
    pass
bal=bal.replace("""jsonb_build_object('ventas', coalesce(ventas, 0), 'utilidad', coalesce(utilidad, 0), 'n', coalesce(n, 0))""",
"""jsonb_build_object('ventas', coalesce(ventas, 0), 'utilidad', utilidad, 'n', n, 'prendas', prendas, 'fuente', fuente)""")
bal=rep(bal,"""'hay_anio_anterior', exists (select 1 from ventas where fecha < (mes_ref - interval '11 months')::date)""",
"""'hay_anio_anterior', exists (select 1 from mensual where mes <= (mes_ref - interval '1 year')::date)""")
bal=rep(bal,"""    'aporte_por_prenda', aporte_cfg,""","""    -- Totales por año (todo el historial; 2024–2025 vienen de las notas mensuales)
    'anual', coalesce((select jsonb_agg(x order by x.anio) from (
        select extract(year from mes)::int as anio, sum(ventas) as ventas, sum(prendas) as prendas,
               sum(n) as n, sum(utilidad) as utilidad,
               bool_or(fuente = 'notas') as con_notas, count(*) filter (where ventas > 0) as meses
        from mensual group by 1) x), '[]'::jsonb),

    'aporte_por_prenda', aporte_cfg,""")

cat=json.load(open(R+'scripts/treinta/catalogo.json'))
q=lambda v: 'null' if v is None else "'"+str(v).replace("'","''")+"'"
slug=lambda s: re.sub(r'[^a-z0-9]+','-',unicodedata.normalize('NFD',s.lower()).encode('ascii','ignore').decode()).strip('-')
viejos=[p for p in cat if not p.get('nuevo')]; nuevos=[p for p in cat if p.get('nuevo')]
filas_nombres=',\n'.join(f"({q(p['sku'])},{q(p['publico'])},{q(p['opcion'])},{q(p['grupo'])},{q(slug(p['publico']+' '+(p['opcion'] or '')+' '+p['sku']))})" for p in viejos)
CATN={'Basicas':'basicas','Polos Lacoste':'polos-lacoste','Polos PRL':'polos-ralph-lauren'}
filas_nuevos=',\n'.join(f"({q(p['sku'])},{q(p['interno'])},{q(p['publico'])},{q(p['grupo'])},{q(slug(p['publico']+' '+p['sku']))},{q(CATN[p['cat_original']])},{p['precio']},{p['costo']},{p['stock'].get('S',0)},{p['stock'].get('M',0)},{p['stock'].get('L',0)})" for p in nuevos)

NOTAS={2024:[(12,741.35),(29,1660),(17,951.45),(17,932.84),(15,893.98),(32,1780),(17,1038),(11,627),(2,120),(0,0),(2,120),(49,2940)],
       2025:[(20,1200),(3,180),(1,60),(13,780),(18,1080),(25,1500),(17,1020),(36,2160),(20,1200),(2,120),(77,5390),(94,6580)]}
for a,t in ((2024,11804),(2025,21270)): assert abs(sum(v for _,v in NOTAS[a])-t)<1, a
filas_res=',\n'.join(f"('{a}-{m+1:02d}-01',{p},{v})" for a in NOTAS for m,(p,v) in enumerate(NOTAS[a]))

sql=f"""-- =====================================================================
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
{cli}

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
{filas_res}
on conflict (mes) do update set prendas = excluded.prendas, ventas = excluded.ventas;

-- ---------------------------------------------------------------------
-- 5. BALANCE v3: incluye ventas por cobrar, nombres internos y 2024–2025
-- ---------------------------------------------------------------------
{bal}

-- ---------------------------------------------------------------------
-- 6. NOMBRES: el actual pasa a ser el interno; la web usa el nombre limpio.
--    Si ya tenía nombre interno (se ejecutó antes), no se toca.
-- ---------------------------------------------------------------------
drop table if exists _nombres;
create temp table _nombres (sku text, publico text, opcion text, grupo text, slug text);
insert into _nombres values
{filas_nombres};

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
{filas_nuevos};

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
"""
open(R+'supabase/fase5.sql','w').write(sql)
print(len(sql.splitlines()),'líneas')
