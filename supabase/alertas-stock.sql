-- =====================================================================
-- BRUNEL BRAND · Alerta de stock: correo cuando una talla BAJA hasta 2
-- (por ejemplo de 3 a 2 después de una venta). No avisa si ya estaba en 2 o menos.
-- Requiere fase3.sql. Pega TODO en Supabase > SQL Editor > Run. Re-ejecutable.
-- =====================================================================

-- 1. Cola de alertas pendientes de enviar
create table if not exists public.alertas_stock (
  id              bigint generated always as identity primary key,
  producto_id     uuid not null references public.productos(id) on delete cascade,
  talla           text not null,
  stock_anterior  int not null,
  stock           int not null,
  creado_en       timestamptz not null default now(),
  enviado_en      timestamptz
);
create index if not exists alertas_stock_pendientes_idx on public.alertas_stock (creado_en) where enviado_en is null;

alter table public.alertas_stock enable row level security;
revoke all on public.alertas_stock from anon;
grant select on public.alertas_stock to authenticated;
drop policy if exists "Equipo ve alertas de stock" on public.alertas_stock;
create policy "Equipo ve alertas de stock" on public.alertas_stock
  for select to authenticated using (public.es_admin());

-- 2. Cuando el stock de una talla cruza el umbral hacia abajo, se anota una alerta.
--    El umbral es el mismo de "Por reponer" (configuracion.umbral_stock, 2 por defecto).
create or replace function public.producto_tallas_alerta()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  umbral int := coalesce((select (valor #>> '{}')::int from public.configuracion where clave = 'umbral_stock'), 2);
begin
  if new.stock < old.stock
     and old.stock > umbral
     and new.stock <= umbral
     and new.talla in ('S', 'M', 'L')
     and exists (select 1 from public.productos p where p.id = new.producto_id and p.activo)
  then
    insert into public.alertas_stock (producto_id, talla, stock_anterior, stock)
    values (new.producto_id, new.talla, old.stock, new.stock);
  end if;
  return new;
end $$;

drop trigger if exists producto_tallas_alerta on public.producto_tallas;
create trigger producto_tallas_alerta
  after update of stock on public.producto_tallas
  for each row execute function public.producto_tallas_alerta();

-- 3. Quitar la talla XL que no se maneja (solo filas sin stock)
delete from public.producto_tallas where talla = 'XL' and stock = 0;
