import json
d = json.load(open('procesado.json'))
q = lambda v: 'null' if v is None else "'" + str(v).replace("'", "''") + "'"
out = ["""-- =====================================================================
-- BRUNEL BRAND · IMPORTACIÓN ÚNICA DEL HISTORIAL DE TREINTA (01/2026 – 10/2026)
-- 207 ventas, 397 líneas de prendas, 34 gastos. Requiere historico.sql.
-- Se puede ejecutar más de una vez: no duplica filas (usa clave_origen) y
-- respeta las prendas que ya confirmaste en el panel.
-- NO toca el stock ni los productos.
-- =====================================================================

drop table if exists _ventas, _gastos, _prendas;
create temp table _ventas (clave text, fecha date, vendedor text, vendedor_original text, descripcion text,
  contacto text, cliente text, nota text, estado text, metodo text, valor numeric, costo numeric, items jsonb);
create temp table _gastos (clave text, fecha date, categoria text, tipo text, descripcion text, proveedor text,
  metodo text, registrado_por text, valor numeric);
create temp table _prendas (clave text, nombre text, unidades int, sku text, estado text, confianza numeric);
"""]
filas = []
for v in d['ventas']:
    items = json.dumps(v['items'], ensure_ascii=False)
    filas.append(f"({q(v['clave'])},{q(v['fecha'])},{q(v['vendedor'])},{q(v['vendedor_original'])},{q(v['descripcion'])},{q(v['contacto'])},{q(v['cliente'])},{q(v['nota'])},{q(v['estado'])},{q(v['metodo'])},{v['valor']},{v['costo']},{q(items)}::jsonb)")
out.append("insert into _ventas values\n" + ",\n".join(filas) + ";\n")
filas = [f"({q(g['clave'])},{q(g['fecha'])},{q(g['categoria'])},{q(g['tipo_original'])},{q(g['descripcion'])},{q(g['proveedor'])},{q(g['metodo'])},{q(g['vendedor'])},{g['valor']})" for g in d['gastos']]
out.append("insert into _gastos values\n" + ",\n".join(filas) + ";\n")
filas = [f"({q(p['clave'])},{q(p['nombre'])},{p['unidades']},{q(p['sku'])},{q(p['estado'])},{p['confianza']})" for p in d['prendas']]
out.append("insert into _prendas values\n" + ",\n".join(filas) + ";\n")
out.append("""
-- 1. Ventas (crea o actualiza sin duplicar)
insert into public.ventas_historicas
  (origen, clave_origen, fecha, vendedor, vendedor_original, descripcion_original, contacto_original,
   cliente_nombre, cliente_nota, estado, metodo_pago, valor, costo)
select 'treinta', clave, fecha, vendedor, vendedor_original, descripcion, contacto, cliente, nota, estado, metodo, valor, costo
from _ventas
on conflict (clave_origen) do update set
  fecha = excluded.fecha, vendedor = excluded.vendedor, vendedor_original = excluded.vendedor_original,
  descripcion_original = excluded.descripcion_original, contacto_original = excluded.contacto_original,
  cliente_nombre = excluded.cliente_nombre, cliente_nota = excluded.cliente_nota, estado = excluded.estado,
  metodo_pago = excluded.metodo_pago, valor = excluded.valor, costo = excluded.costo;

-- 2. Prendas de cada venta (se reemplazan para no duplicar)
delete from public.ventas_historicas_items
where venta_id in (select h.id from public.ventas_historicas h join _ventas t on t.clave = h.clave_origen);

insert into public.ventas_historicas_items (venta_id, cantidad, nombre_original, talla, corte, prenda_clave)
select h.id, it.cantidad, it.nombre, it.talla, it.corte, it.prenda_clave
from _ventas t
join public.ventas_historicas h on h.clave_origen = t.clave
cross join lateral jsonb_to_recordset(t.items) as it(cantidad int, nombre text, talla text, corte text, prenda_clave text);

-- 3. Prendas agrupadas y relación con el catálogo (por código SKU del inventario).
--    Si ya confirmaste o descartaste una prenda en el panel, no se cambia.
insert into public.prendas_historicas (clave, nombre, unidades, producto_id, sugerido_id, estado, confianza)
select t.clave, t.nombre, t.unidades,
       case when t.estado = 'automatico' then p.id end,
       p.id,
       case when t.estado in ('automatico', 'dudoso') and p.id is null then 'sin_coincidencia' else t.estado end,
       t.confianza
from _prendas t
left join public.productos p on p.sku = t.sku
on conflict (clave) do update set
  nombre = excluded.nombre,
  unidades = excluded.unidades,
  sugerido_id = case when public.prendas_historicas.estado in ('confirmado', 'descartado')
                     then public.prendas_historicas.sugerido_id else excluded.sugerido_id end,
  producto_id = case when public.prendas_historicas.estado in ('confirmado', 'descartado')
                     then public.prendas_historicas.producto_id else excluded.producto_id end,
  estado = case when public.prendas_historicas.estado in ('confirmado', 'descartado')
                then public.prendas_historicas.estado else excluded.estado end,
  confianza = excluded.confianza;

-- 4. Gastos (compras de mercadería, operativos y abonos por separado)
insert into public.gastos_historicos
  (origen, clave_origen, fecha, categoria, tipo_original, descripcion, proveedor, metodo_pago, registrado_por, valor)
select 'treinta', clave, fecha, categoria, tipo, descripcion, proveedor, metodo, registrado_por, valor
from _gastos
on conflict (clave_origen) do update set
  fecha = excluded.fecha, categoria = excluded.categoria, tipo_original = excluded.tipo_original,
  descripcion = excluded.descripcion, proveedor = excluded.proveedor, metodo_pago = excluded.metodo_pago,
  registrado_por = excluded.registrado_por, valor = excluded.valor;

drop table if exists _ventas, _gastos, _prendas;

-- 5. Revisión: debe decir 207 ventas · $30346.90 · costo $13696.00 · 397 líneas · 34 gastos
select (select count(*) from public.ventas_historicas where origen = 'treinta') as ventas,
       (select sum(valor) from public.ventas_historicas where origen = 'treinta') as total_ventas,
       (select sum(costo) from public.ventas_historicas where origen = 'treinta') as total_costo,
       (select count(*) from public.ventas_historicas_items i join public.ventas_historicas h on h.id = i.venta_id where h.origen = 'treinta') as lineas,
       (select count(*) from public.gastos_historicos where origen = 'treinta') as gastos,
       (select count(*) filter (where estado = 'automatico') || ' automáticas · ' ||
               count(*) filter (where estado = 'dudoso') || ' dudosas · ' ||
               count(*) filter (where estado = 'sin_coincidencia') || ' sin coincidencia'
          from public.prendas_historicas) as prendas;
""")
open('/home/claude/brunelbrand/supabase/importar-treinta.sql', 'w').write('\n'.join(out))
