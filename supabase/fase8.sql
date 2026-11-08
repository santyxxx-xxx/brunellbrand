-- =====================================================================
-- BRUNEL BRAND · FASE 8 · Marca "Polo Ralph Lauren" en toda la ropa
--   Toda la ropa es Polo Ralph Lauren, salvo las que ya dicen otra marca
--   en el nombre (Lacoste, Boss, Tommy Hilfiger), que se respetan.
-- Requiere fase7.sql. Se puede ejecutar más de una vez.
-- =====================================================================
update public.productos set marca = 'Polo Ralph Lauren'
where marca is null or trim(marca) = '' or marca = 'Ralph Lauren';

-- Las prendas nuevas (o importadas por CSV) nacen como Polo Ralph Lauren
alter table public.productos alter column marca set default 'Polo Ralph Lauren';

-- Revisión
select marca, count(*) as productos from public.productos group by marca order by 2 desc;
