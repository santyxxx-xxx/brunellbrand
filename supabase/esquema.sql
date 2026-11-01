-- =====================================================================
-- BRUNEL BRAND · Esquema de base de datos para Supabase
-- Pega TODO este archivo en Supabase > SQL Editor > New query > Run.
-- Se puede ejecutar más de una vez sin romper nada.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TABLAS
-- ---------------------------------------------------------------------

-- Categorías (Camisas, Polos, etc.)
create table if not exists public.categorias (
  id          bigint generated always as identity primary key,
  nombre      text not null,
  slug        text not null unique,
  orden       int  not null default 0,
  imagen_url  text,
  creado_en   timestamptz not null default now()
);

-- Productos
create table if not exists public.productos (
  id               uuid primary key default gen_random_uuid(),
  sku              text not null unique,          -- código interno del producto
  nombre           text not null,
  slug             text not null unique,          -- se usa en la URL
  descripcion      text,
  precio           numeric(10,2) not null check (precio >= 0),
  precio_anterior  numeric(10,2) check (precio_anterior >= 0),  -- para mostrar "antes $X"
  categoria_id     bigint references public.categorias(id) on delete set null,
  imagenes         text[] not null default '{}',  -- URLs públicas de las fotos (la primera es la portada)
  destacado        boolean not null default false,
  activo           boolean not null default true, -- si es false, no aparece en la tienda
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now()
);

create index if not exists productos_categoria_idx on public.productos (categoria_id);
create index if not exists productos_destacado_idx on public.productos (destacado) where destacado;

-- Tallas y stock por producto
create table if not exists public.producto_tallas (
  id           bigint generated always as identity primary key,
  producto_id  uuid not null references public.productos(id) on delete cascade,
  talla        text not null check (talla in ('XS','S','M','L','XL','XXL')),
  stock        int  not null default 0 check (stock >= 0),
  unique (producto_id, talla)
);

create index if not exists producto_tallas_talla_idx on public.producto_tallas (talla, stock);

-- Usuarios administradores (se enlaza con los usuarios de Supabase Auth)
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  creado_en  timestamptz not null default now()
);

-- Actualiza "actualizado_en" automáticamente al editar un producto
create or replace function public.tocar_actualizado_en()
returns trigger language plpgsql as $$
begin
  new.actualizado_en = now();
  return new;
end $$;

drop trigger if exists productos_actualizado_en on public.productos;
create trigger productos_actualizado_en
  before update on public.productos
  for each row execute function public.tocar_actualizado_en();

-- ---------------------------------------------------------------------
-- 2. FUNCIÓN: ¿el usuario actual es admin?
-- ---------------------------------------------------------------------
create or replace function public.es_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------
-- 3. PERMISOS BÁSICOS
-- ---------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on public.categorias, public.productos, public.producto_tallas to anon, authenticated;
grant insert, update, delete on public.categorias, public.productos, public.producto_tallas to authenticated;
grant execute on function public.es_admin() to anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. SEGURIDAD (RLS): cualquiera ve, solo el admin crea/edita/borra
-- ---------------------------------------------------------------------
alter table public.categorias      enable row level security;
alter table public.productos       enable row level security;
alter table public.producto_tallas enable row level security;
alter table public.admins          enable row level security;  -- sin políticas: nadie la lee desde la web

-- CATEGORÍAS
drop policy if exists "Categorías visibles para todos" on public.categorias;
create policy "Categorías visibles para todos" on public.categorias
  for select using (true);

drop policy if exists "Admin crea categorías" on public.categorias;
create policy "Admin crea categorías" on public.categorias
  for insert to authenticated with check (public.es_admin());

drop policy if exists "Admin edita categorías" on public.categorias;
create policy "Admin edita categorías" on public.categorias
  for update to authenticated using (public.es_admin()) with check (public.es_admin());

drop policy if exists "Admin borra categorías" on public.categorias;
create policy "Admin borra categorías" on public.categorias
  for delete to authenticated using (public.es_admin());

-- PRODUCTOS (el público solo ve los activos; el admin ve todos)
drop policy if exists "Productos visibles para todos" on public.productos;
create policy "Productos visibles para todos" on public.productos
  for select using (activo or public.es_admin());

drop policy if exists "Admin crea productos" on public.productos;
create policy "Admin crea productos" on public.productos
  for insert to authenticated with check (public.es_admin());

drop policy if exists "Admin edita productos" on public.productos;
create policy "Admin edita productos" on public.productos
  for update to authenticated using (public.es_admin()) with check (public.es_admin());

drop policy if exists "Admin borra productos" on public.productos;
create policy "Admin borra productos" on public.productos
  for delete to authenticated using (public.es_admin());

-- TALLAS / STOCK
drop policy if exists "Tallas visibles para todos" on public.producto_tallas;
create policy "Tallas visibles para todos" on public.producto_tallas
  for select using (true);

drop policy if exists "Admin crea tallas" on public.producto_tallas;
create policy "Admin crea tallas" on public.producto_tallas
  for insert to authenticated with check (public.es_admin());

drop policy if exists "Admin edita tallas" on public.producto_tallas;
create policy "Admin edita tallas" on public.producto_tallas
  for update to authenticated using (public.es_admin()) with check (public.es_admin());

drop policy if exists "Admin borra tallas" on public.producto_tallas;
create policy "Admin borra tallas" on public.producto_tallas
  for delete to authenticated using (public.es_admin());

-- ---------------------------------------------------------------------
-- 5. STORAGE: bucket público "productos" para las fotos
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('productos', 'productos', true)
on conflict (id) do update set public = true;

drop policy if exists "Fotos de productos visibles para todos" on storage.objects;
create policy "Fotos de productos visibles para todos" on storage.objects
  for select using (bucket_id = 'productos');

drop policy if exists "Admin sube fotos de productos" on storage.objects;
create policy "Admin sube fotos de productos" on storage.objects
  for insert to authenticated with check (bucket_id = 'productos' and public.es_admin());

drop policy if exists "Admin reemplaza fotos de productos" on storage.objects;
create policy "Admin reemplaza fotos de productos" on storage.objects
  for update to authenticated using (bucket_id = 'productos' and public.es_admin());

drop policy if exists "Admin borra fotos de productos" on storage.objects;
create policy "Admin borra fotos de productos" on storage.objects
  for delete to authenticated using (bucket_id = 'productos' and public.es_admin());

-- ---------------------------------------------------------------------
-- 6. CATEGORÍAS INICIALES (puedes cambiarlas luego desde el panel)
-- ---------------------------------------------------------------------
insert into public.categorias (nombre, slug, orden) values
  ('Camisas', 'camisas', 1),
  ('Polos',   'polos',   2)
on conflict (slug) do nothing;

-- =====================================================================
-- 7. DAR PERMISO DE ADMIN A TU USUARIO  (hazlo DESPUÉS de crear el usuario)
--    a) Supabase > Authentication > Users > Add user (correo + contraseña,
--       marca "Auto Confirm User").
--    b) Cambia el correo de abajo por el tuyo y ejecuta solo estas líneas:
--
-- insert into public.admins (user_id)
-- select id from auth.users where email = 'tu-correo@ejemplo.com'
-- on conflict do nothing;
-- =====================================================================
