import { obtenerClientePublico } from "@/lib/supabase/publico";
import { agruparModelos } from "@/lib/utilidades";

// Campos que usan las tarjetas y la página de producto
const CAMPOS_PRODUCTO = `
  id, sku, nombre, slug, descripcion, precio, precio_anterior, imagenes, destacado, grupo, opcion, marca, creado_en,
  categoria:categorias ( id, nombre, slug ),
  tallas:producto_tallas ( talla, stock )
`;
// Mientras no se ejecute fase5.sql (sin grupo/opción)
const CAMPOS_SIN_MARCA = CAMPOS_PRODUCTO.replace(" marca,", "");
const CAMPOS_BASICOS = CAMPOS_SIN_MARCA.replace(" grupo, opcion,", "");

// Ejecuta la consulta con los campos nuevos y, si la base aún no los tiene, con los básicos
async function conCampos(armar) {
  let r = await armar(CAMPOS_PRODUCTO);
  // Sin fase7.sql (marca) o sin fase5.sql (grupo/opción)
  if (r.error && /marca/.test(r.error.message || "")) r = await armar(CAMPOS_SIN_MARCA);
  if (r.error && /grupo|opcion/.test(r.error.message || "")) r = await armar(CAMPOS_BASICOS);
  return r;
}

// Todas las consultas devuelven datos vacíos si algo falla,
// para que la tienda nunca se caiga (por ejemplo, antes de crear las tablas).
function registrarError(origen, error) {
  if (error) console.error(`[consultas] ${origen}:`, error.message);
}

export async function obtenerCategorias() {
  const supabase = obtenerClientePublico();
  if (!supabase) return [];
  const ordenar = (q) => q.order("orden", { ascending: true }).order("nombre", { ascending: true });
  let { data, error } = await ordenar(
    supabase.from("categorias").select("id, nombre, slug, imagen_url, orden, parent_id, visible").eq("visible", true)
  );
  // Compatibilidad: si aún no se ejecutó fase5.sql (sin "visible") o el SQL de subcategorías (sin parent_id)
  if (error) {
    ({ data, error } = await ordenar(supabase.from("categorias").select("id, nombre, slug, imagen_url, orden, parent_id")));
  }
  if (error) {
    ({ data, error } = await ordenar(supabase.from("categorias").select("id, nombre, slug, imagen_url, orden")));
  }
  registrarError("obtenerCategorias", error);
  return (data || []).map((c) => ({ ...c, parent_id: c.parent_id ?? null }));
}

export async function obtenerDestacados(limite = 8) {
  const supabase = obtenerClientePublico();
  if (!supabase) return [];
  let { data, error } = await conCampos((campos) =>
    supabase.from("productos").select(campos).eq("destacado", true).order("creado_en", { ascending: false }).limit(limite * 3)
  );
  registrarError("obtenerDestacados", error);

  // Si aún no hay destacados, muestra los más recientes
  if (!error && (!data || data.length === 0)) {
    const respuesta = await conCampos((campos) =>
      supabase.from("productos").select(campos).order("creado_en", { ascending: false }).limit(limite * 3)
    );
    registrarError("obtenerDestacados (recientes)", respuesta.error);
    data = respuesta.data;
  }
  return agruparModelos(data || []).slice(0, limite);
}

export async function obtenerProductos({ categoria, talla, orden } = {}) {
  const supabase = obtenerClientePublico();
  if (!supabase) return [];

  let ids_categoria = null;
  let ids_talla = null;

  if (categoria) {
    // Una categoría principal incluye los productos de sus subcategorías
    const categorias = await obtenerCategorias();
    const cat = categorias.find((c) => c.slug === categoria);
    if (!cat) return [];
    ids_categoria = [cat.id, ...categorias.filter((c) => c.parent_id === cat.id).map((c) => c.id)];
  }

  if (talla) {
    // Productos que tienen esa talla con stock disponible
    const { data: conTalla, error } = await supabase
      .from("producto_tallas")
      .select("producto_id")
      .eq("talla", talla)
      .gt("stock", 0);
    registrarError("obtenerProductos (talla)", error);
    ids_talla = [...new Set((conTalla || []).map((t) => t.producto_id))];
    if (ids_talla.length === 0) return [];
  }

  const { data, error } = await conCampos((campos) => {
    let consulta = supabase.from("productos").select(campos);
    if (ids_categoria) consulta = consulta.in("categoria_id", ids_categoria);
    if (ids_talla) consulta = consulta.in("id", ids_talla);
    // Por defecto: de la prenda más cara a la más barata
    if (orden === "precio-asc") consulta = consulta.order("precio", { ascending: true });
    else if (orden === "recientes") consulta = consulta.order("creado_en", { ascending: false });
    else consulta = consulta.order("precio", { ascending: false }).order("nombre", { ascending: true });
    return consulta.limit(500);
  });
  registrarError("obtenerProductos", error);
  // Un solo modelo por prenda (Oxford y Casual juntos)
  return agruparModelos(data || []);
}

export async function obtenerProductoPorSlug(slug) {
  const supabase = obtenerClientePublico();
  if (!supabase) return null;
  const { data, error } = await conCampos((campos) => supabase.from("productos").select(campos).eq("slug", slug).maybeSingle());
  registrarError("obtenerProductoPorSlug", error);
  if (!data) return null;
  // Las otras versiones del mismo modelo (Oxford / Casual, u otro lote)
  let variantes = [data];
  if (data.grupo) {
    const r = await conCampos((campos) => supabase.from("productos").select(campos).eq("grupo", data.grupo).order("creado_en"));
    registrarError("obtenerProductoPorSlug (variantes)", r.error);
    if (r.data?.length) variantes = r.data;
  }
  return { ...data, variantes };
}

export async function obtenerRelacionados(producto, limite = 4) {
  const supabase = obtenerClientePublico();
  if (!supabase || !producto?.categoria?.id) return [];
  const { data, error } = await conCampos((campos) =>
    supabase.from("productos").select(campos).eq("categoria_id", producto.categoria.id).limit(40)
  );
  registrarError("obtenerRelacionados", error);
  const propios = new Set((producto.variantes || [producto]).map((v) => v.id));
  return agruparModelos((data || []).filter((p) => !propios.has(p.id)))
    .filter((m) => m.tallas.some((t) => t.stock > 0))
    .slice(0, limite);
}

// Número real de pedidos entregados (función pública en Supabase; null si no está disponible)
export async function obtenerPedidosEntregados() {
  const supabase = obtenerClientePublico();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("pedidos_entregados");
  if (error) return null;
  return Number(data) || 0;
}

// Prendas entregadas en todo el historial (2024 en adelante); null si la función no existe aún
export async function obtenerPrendasEntregadas() {
  const supabase = obtenerClientePublico();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("prendas_entregadas");
  if (error) return null;
  return Number(data) || 0;
}
