-- =====================================================================
-- BRUNEL BRAND · FASE 7 · DIRECTORIO DE CLIENTES (solo el administrador)
--   Junta a los clientes de Treinta, del panel y de la web, con lo que compraron.
--   Guarda teléfono, correo, ciudad y notas de cada uno (respaldo por si se pierden los chats).
-- Requiere fase5.sql. Pega TODO en Supabase > SQL Editor > Run. Se puede ejecutar más de una vez.
-- =====================================================================

-- Clave para reconocer al mismo cliente aunque esté escrito distinto
-- ("Mateo Dávalos", "mateo davalos ", "MATEO  DAVALOS" → "mateo davalos")
create or replace function public.clave_cliente(p_nombre text)
returns text language sql immutable as $$
  select nullif(regexp_replace(translate(lower(trim(coalesce(p_nombre, ''))), 'áéíóúüñàèìòù', 'aeiouunaeiou'), '\s+', ' ', 'g'), '');
$$;

-- ---------------------------------------------------------------------
-- 1. FICHA DE CADA CLIENTE (datos que se escriben a mano)
-- ---------------------------------------------------------------------
create table if not exists public.clientes (
  clave          text primary key,
  nombre         text not null,
  telefono       text,
  correo         text,
  ciudad         text,
  notas          text,
  creado_en      timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

revoke all on public.clientes from anon;
grant select, insert, update, delete on public.clientes to authenticated;
alter table public.clientes enable row level security;
drop policy if exists "Solo admin ve clientes" on public.clientes;
create policy "Solo admin ve clientes" on public.clientes
  for all to authenticated using (public.es_admin_total()) with check (public.es_admin_total());

create or replace function public.clientes_actualizado()
returns trigger language plpgsql as $$
begin
  new.nombre := regexp_replace(trim(new.nombre), '\s+', ' ', 'g');
  new.clave := public.clave_cliente(new.nombre);
  new.actualizado_en := now();
  return new;
end $$;
drop trigger if exists clientes_actualizado on public.clientes;
create trigger clientes_actualizado before insert or update on public.clientes
  for each row execute function public.clientes_actualizado();

-- ---------------------------------------------------------------------
-- 2. TODAS LAS COMPRAS POR CLIENTE (vista interna, no se expone a la web)
-- ---------------------------------------------------------------------
create or replace function public._compras_clientes()
returns table (clave text, nombre text, telefono text, correo text, ciudad text, fecha date, origen text,
               total numeric, estado text, vendedor text, venta_id text)
language sql stable security definer set search_path = public as $$
  select public.clave_cliente(h.cliente_nombre), h.cliente_nombre, null, null, null, h.fecha, 'treinta',
         h.valor, h.estado, h.vendedor, 'h' || h.id
  from public.ventas_historicas h
  where public.clave_cliente(h.cliente_nombre) is not null
  union all
  select public.clave_cliente(o.cliente_nombre), o.cliente_nombre, nullif(o.cliente_telefono, '-'), nullif(o.cliente_correo, '-'),
         case when o.canal = 'web' then o.ciudad end,
         (o.creado_en at time zone 'America/Guayaquil')::date, o.canal, o.total, o.estado,
         coalesce(o.vendedor_nombre, 'Tienda online'), o.id::text
  from public.orders o
  where o.estado in ('por_cobrar', 'pagado', 'enviado', 'entregado')
    and o.cliente_nombre <> 'Cliente en tienda'
    and public.clave_cliente(o.cliente_nombre) is not null;
$$;
revoke execute on function public._compras_clientes() from public, anon, authenticated;

-- Prendas de cada compra (nombre y talla)
create or replace function public._prendas_clientes()
returns table (clave text, nombre text, talla text, cantidad int)
language sql stable security definer set search_path = public as $$
  select public.clave_cliente(h.cliente_nombre), i.nombre_original, upper(i.talla), i.cantidad
  from public.ventas_historicas_items i join public.ventas_historicas h on h.id = i.venta_id
  where public.clave_cliente(h.cliente_nombre) is not null
  union all
  select public.clave_cliente(o.cliente_nombre), i.nombre, upper(i.talla), i.cantidad
  from public.order_items i join public.orders o on o.id = i.order_id
  where o.estado in ('por_cobrar', 'pagado', 'enviado', 'entregado') and o.cliente_nombre <> 'Cliente en tienda';
$$;
revoke execute on function public._prendas_clientes() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. DIRECTORIO COMPLETO
-- ---------------------------------------------------------------------
create or replace function public.clientes_directorio()
returns jsonb
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.es_admin_total() then
    raise exception 'Solo el administrador puede ver clientes.' using errcode = '42501';
  end if;

  return coalesce((
    with compras as (select * from public._compras_clientes()),
    prendas as (select * from public._prendas_clientes()),
    agregado as (
      select c.clave,
             (array_agg(c.nombre order by c.fecha desc))[1] as nombre,
             (array_agg(c.telefono order by c.fecha desc) filter (where c.telefono is not null))[1] as telefono,
             (array_agg(c.correo order by c.fecha desc) filter (where c.correo is not null))[1] as correo,
             (array_agg(c.ciudad order by c.fecha desc) filter (where c.ciudad is not null))[1] as ciudad,
             count(*) as compras, sum(c.total) as total,
             sum(c.total) filter (where c.estado = 'por_cobrar') as por_cobrar,
             min(c.fecha) as primera, max(c.fecha) as ultima,
             array_agg(distinct c.vendedor) filter (where c.vendedor is not null) as vendedores
      from compras c group by c.clave
    ),
    tallas as (
      select clave, jsonb_object_agg(talla, unidades) as tallas, sum(unidades) as prendas
      from (select clave, coalesce(talla, '?') as talla, sum(cantidad) as unidades from prendas group by 1, 2) t
      group by clave
    ),
    favoritas as (
      select clave, jsonb_agg(nombre order by unidades desc) as favoritas
      from (select clave, nombre, sum(cantidad) as unidades,
                   row_number() over (partition by clave order by sum(cantidad) desc) as puesto
            from prendas group by 1, 2) f
      where puesto <= 5
      group by clave
    )
    select jsonb_agg(jsonb_build_object(
             'clave', coalesce(f.clave, a.clave),
             'nombre', coalesce(f.nombre, a.nombre),
             'telefono', coalesce(f.telefono, a.telefono),
             'correo', coalesce(f.correo, a.correo),
             'ciudad', coalesce(f.ciudad, a.ciudad),
             'notas', f.notas,
             'ficha', f.clave is not null,
             'compras', coalesce(a.compras, 0),
             'total', coalesce(a.total, 0),
             'por_cobrar', coalesce(a.por_cobrar, 0),
             'primera', a.primera,
             'ultima', a.ultima,
             'vendedores', coalesce(to_jsonb(a.vendedores), '[]'::jsonb),
             'prendas', coalesce(t.prendas, 0),
             'tallas', coalesce(t.tallas, '{}'::jsonb),
             'favoritas', coalesce(fa.favoritas, '[]'::jsonb))
           order by coalesce(a.total, 0) desc, coalesce(f.nombre, a.nombre))
    from agregado a
    full join public.clientes f on f.clave = a.clave
    left join tallas t on t.clave = coalesce(f.clave, a.clave)
    left join favoritas fa on fa.clave = coalesce(f.clave, a.clave)
  ), '[]'::jsonb);
end $$;

revoke execute on function public.clientes_directorio() from public, anon;
grant execute on function public.clientes_directorio() to authenticated;

-- ---------------------------------------------------------------------
-- 4. Vender y la ficha usan la misma forma de reconocer al cliente
-- ---------------------------------------------------------------------
create or replace function public.buscar_clientes(p_texto text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  q text := public.clave_cliente(p_texto);
begin
  if not public.es_admin_total() then
    raise exception 'Solo el administrador puede ver clientes.' using errcode = '42501';
  end if;
  if q is null or length(q) < 2 then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(x) from (
    select coalesce(f.nombre, a.nombre) as nombre, coalesce(f.telefono, a.telefono) as telefono,
           coalesce(a.compras, 0) as compras, coalesce(a.total, 0) as total, a.ultima
    from (
      select clave, (array_agg(nombre order by fecha desc))[1] as nombre,
             (array_agg(telefono order by fecha desc) filter (where telefono is not null))[1] as telefono,
             count(*) as compras, sum(total) as total, max(fecha) as ultima
      from public._compras_clientes() group by clave
    ) a
    full join public.clientes f on f.clave = a.clave
    where coalesce(f.clave, a.clave) like '%' || q || '%'
    order by coalesce(a.total, 0) desc
    limit 8) x), '[]'::jsonb);
end $$;

create or replace function public.historial_cliente(p_nombre text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  q text := public.clave_cliente(p_nombre);
begin
  if not public.es_admin_total() then
    raise exception 'Solo el administrador puede ver clientes.' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(x order by x.fecha desc) from (
    select h.fecha, 'Treinta' as origen, h.descripcion_original as detalle, h.valor, h.metodo_pago, h.vendedor,
           h.estado, null::uuid as pedido_id
    from public.ventas_historicas h
    where public.clave_cliente(h.cliente_nombre) = q
    union all
    select (o.creado_en at time zone 'America/Guayaquil')::date,
           case when o.canal = 'web' then 'Web' else 'Tienda' end,
           (select string_agg(i.cantidad || ' ' || i.nombre || ' (' || i.talla || ') $' || i.precio_unitario, ', ' order by i.id)
              from public.order_items i where i.order_id = o.id),
           o.total, o.metodo_pago, coalesce(o.vendedor_nombre, 'Tienda online'), o.estado, o.id
    from public.orders o
    where o.estado in ('pagado', 'por_cobrar', 'enviado', 'entregado') and public.clave_cliente(o.cliente_nombre) = q
    order by 1 desc
    limit 100) x), '[]'::jsonb);
end $$;

revoke execute on function public.buscar_clientes(text), public.historial_cliente(text) from public, anon;
grant execute on function public.buscar_clientes(text), public.historial_cliente(text) to authenticated;

-- ---------------------------------------------------------------------
-- 5. MARCA DE CADA PRENDA (en la web va al final: "Polo azul Ralph Lauren")
--    Se saca del nombre de la web solo una vez (si la prenda aún no tiene marca).
--    El nombre del panel no cambia.
-- ---------------------------------------------------------------------
alter table public.productos add column if not exists marca text;
grant select (marca) on public.productos to anon;

do $$
declare
  m record;
begin
  for m in
    select * from (values
      ('Ralph Lauren', '\s*\m(Polo\s+)?(Ralph\s+Lauren|PRL)\M'),
      ('Lacoste',      '\s*\mLacoste\M'),
      ('Boss',         '\s*\m(Hugo\s+)?Boss\M'),
      ('Tommy Hilfiger', '\s*\mTommy(\s+Hilfiger)?\M'),
      ('Gucci',        '\s*\mGucci\M'),
      ('Calvin Klein', '\s*\mCalvin\s+Klein\M')
    ) as t(marca, patron)
  loop
    update public.productos
      set marca = m.marca,
          -- "Polo Ralph Lauren azul" → "Polo azul"; si el nombre era solo la marca, queda la prenda
          nombre = initcap(left(
                     coalesce(nullif(trim(regexp_replace(
                       regexp_replace(nombre, m.patron, case when nombre ~* '^\s*Polo\s+(Ralph|PRL)' then ' Polo' else '' end, 'i'),
                       '\s+', ' ', 'g')), ''), nombre), 1))
                 || substr(coalesce(nullif(trim(regexp_replace(
                       regexp_replace(nombre, m.patron, case when nombre ~* '^\s*Polo\s+(Ralph|PRL)' then ' Polo' else '' end, 'i'),
                       '\s+', ' ', 'g')), ''), nombre), 2)
    where marca is null and nombre ~* m.patron;
  end loop;
end $$;

-- Revisión
select nombre, marca from public.productos where marca is not null order by marca, nombre limit 60;
select count(*) as clientes_con_compras from (select distinct clave from public._compras_clientes()) x;
