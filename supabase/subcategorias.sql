-- =====================================================================
-- BRUNEL BRAND · Subcategorías (menú desplegable tipo "Camisas → A rayas, Rayas finas…")
-- Pega TODO en Supabase > SQL Editor > Run. Se puede ejecutar más de una vez.
-- Requiere haber importado el inventario (las categorías se buscan por su "slug").
-- =====================================================================

-- 1. Columna para indicar la categoría principal
alter table public.categorias
  add column if not exists parent_id bigint references public.categorias(id) on delete set null;

create index if not exists categorias_parent_idx on public.categorias (parent_id);

-- 2. Categoría principal "Camisas"
insert into public.categorias (nombre, slug, orden)
values ('Camisas', 'camisas', 1)
on conflict (slug) do update set nombre = 'Camisas', parent_id = null, orden = 1;

-- 3. Subcategorías de Camisas (nombres cortos para el menú; el slug no cambia)
update public.categorias c set
  parent_id = (select id from public.categorias where slug = 'camisas'),
  nombre = v.nombre,
  orden = v.orden
from (values
  ('camisas-colores-enteros', 'Colores enteros', 1),
  ('camisas-a-rayas',         'A rayas',         2),
  ('camisas-a-rayas-finas',   'Rayas finas',     3),
  ('camisas-a-cuadros',       'A cuadros',       4),
  ('lino',                    'Lino',            5)
) as v(slug, nombre, orden)
where c.slug = v.slug;

-- 4. Ropa Susy: sus camisas pasan a "Colores enteros", se quita la palabra "Susy"
--    del nombre y de la URL, y se borra la categoría.
update public.productos p set
  nombre = trim(regexp_replace(p.nombre, '\s+susy\y', '', 'gi')),
  slug   = regexp_replace(p.slug, '-susy(?=-|$)', '', 'g'),
  categoria_id = (select id from public.categorias where slug = 'camisas-colores-enteros')
where p.categoria_id = (select id from public.categorias where slug = 'ropa-susy');

delete from public.categorias where slug = 'ropa-susy';

-- 5. Categorías principales restantes (en el orden del menú)
update public.categorias set parent_id = null, orden = 2 where slug = 'chaquetas';
update public.categorias set parent_id = null, orden = 3 where slug = 'sacos-de-lana';
update public.categorias set parent_id = null, orden = 4, nombre = 'Buzos medio cierre' where slug = 'buzos-medio-cierre';

-- 6. Borra la categoría de ejemplo "Polos" si quedó vacía
delete from public.categorias c
where c.slug = 'polos'
  and not exists (select 1 from public.productos p where p.categoria_id = c.id);

-- 7. Revisión: así queda el menú
select coalesce(padre.nombre, c.nombre) as principal,
       case when c.parent_id is null then '—' else c.nombre end as subcategoria,
       (select count(*) from public.productos p where p.categoria_id = c.id) as productos
from public.categorias c
left join public.categorias padre on padre.id = c.parent_id
order by coalesce(padre.orden, c.orden), c.parent_id nulls first, c.orden;
