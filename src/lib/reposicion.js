// Lista de productos/tallas con stock bajo. Funciona con el cliente del navegador
// (panel, protegido por RLS) o con el cliente de servidor (correo mensual).

export async function leerConfigReposicion(supabase) {
  const { data } = await supabase.from("configuracion").select("clave, valor").in("clave", ["umbral_stock", "correo_reposicion"]);
  const mapa = Object.fromEntries((data || []).map((c) => [c.clave, c.valor]));
  return {
    umbral: Number.isFinite(Number(mapa.umbral_stock)) ? Number(mapa.umbral_stock) : 2,
    correoActivo: mapa.correo_reposicion?.activo !== false,
    soloActivos: mapa.correo_reposicion?.solo_activos !== false,
  };
}

export async function obtenerPorReponer(supabase, { umbral = 2, soloActivos = true } = {}) {
  const { data, error } = await supabase
    .from("producto_tallas")
    .select("talla, stock, producto:productos(id, sku, nombre, activo, imagenes, categoria:categorias(nombre))")
    .lte("stock", umbral)
    .order("stock", { ascending: true });
  if (error) throw error;

  const porProducto = new Map();
  for (const fila of data || []) {
    const p = fila.producto;
    if (!p || (soloActivos && !p.activo)) continue;
    if (!porProducto.has(p.id)) {
      porProducto.set(p.id, {
        id: p.id,
        sku: p.sku,
        nombre: p.nombre,
        activo: p.activo,
        imagen: p.imagenes?.[0] || null,
        categoria: p.categoria?.nombre || "",
        tallas: [],
      });
    }
    porProducto.get(p.id).tallas.push({ talla: fila.talla, stock: fila.stock });
  }
  const orden = ["XS", "S", "M", "L", "XL", "XXL"];
  return [...porProducto.values()]
    .map((p) => ({ ...p, tallas: p.tallas.sort((a, b) => orden.indexOf(a.talla) - orden.indexOf(b.talla)) }))
    .sort((a, b) => a.categoria.localeCompare(b.categoria) || a.nombre.localeCompare(b.nombre));
}
