import { obtenerClientePublico } from "@/lib/supabase/publico";

// Campos que usan las tarjetas y la página de producto
const CAMPOS_PRODUCTO = `
  id, sku, nombre, slug, descripcion, precio, precio_anterior, imagenes, destacado,
  categoria:categorias ( id, nombre, slug ),
  tallas:producto_tallas ( talla, stock )
`;

// Todas las consultas devuelven datos vacíos si algo falla,
// para que la tienda nunca se caiga (por ejemplo, antes de crear las tablas).
function registrarError(origen, error) {
  if (error) console.error(`[consultas] ${origen}:`, error.message);
}

export async function obtenerCategorias() {
  const supabase = obtenerClientePublico();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("categorias")
    .select("id, nombre, slug, imagen_url, orden")
    .order("orden", { ascending: true })
    .order("nombre", { ascending: true });
  registrarError("obtenerCategorias", error);
  return data || [];
}

export async function obtenerDestacados(limite = 8) {
  const supabase = obtenerClientePublico();
  if (!supabase) return [];
  let { data, error } = await supabase
    .from("productos")
    .select(CAMPOS_PRODUCTO)
    .eq("destacado", true)
    .order("creado_en", { ascending: false })
    .limit(limite);
  registrarError("obtenerDestacados", error);

  // Si aún no hay destacados, muestra los más recientes
  if (!error && (!data || data.length === 0)) {
    const respuesta = await supabase
      .from("productos")
      .select(CAMPOS_PRODUCTO)
      .order("creado_en", { ascending: false })
      .limit(limite);
    registrarError("obtenerDestacados (recientes)", respuesta.error);
    data = respuesta.data;
  }
  return data || [];
}

export async function obtenerProductos({ categoria, talla, orden } = {}) {
  const supabase = obtenerClientePublico();
  if (!supabase) return [];

  let consulta = supabase.from("productos").select(CAMPOS_PRODUCTO);

  if (categoria) {
    const { data: cat } = await supabase
      .from("categorias")
      .select("id")
      .eq("slug", categoria)
      .maybeSingle();
    if (!cat) return [];
    consulta = consulta.eq("categoria_id", cat.id);
  }

  if (talla) {
    // Productos que tienen esa talla con stock disponible
    const { data: conTalla, error } = await supabase
      .from("producto_tallas")
      .select("producto_id")
      .eq("talla", talla)
      .gt("stock", 0);
    registrarError("obtenerProductos (talla)", error);
    const ids = [...new Set((conTalla || []).map((t) => t.producto_id))];
    if (ids.length === 0) return [];
    consulta = consulta.in("id", ids);
  }

  if (orden === "precio-asc") consulta = consulta.order("precio", { ascending: true });
  else if (orden === "precio-desc") consulta = consulta.order("precio", { ascending: false });
  else consulta = consulta.order("creado_en", { ascending: false });

  const { data, error } = await consulta.limit(500);
  registrarError("obtenerProductos", error);
  return data || [];
}

export async function obtenerProductoPorSlug(slug) {
  const supabase = obtenerClientePublico();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("productos")
    .select(CAMPOS_PRODUCTO)
    .eq("slug", slug)
    .maybeSingle();
  registrarError("obtenerProductoPorSlug", error);
  return data || null;
}

export async function obtenerRelacionados(producto, limite = 4) {
  const supabase = obtenerClientePublico();
  if (!supabase || !producto?.categoria?.id) return [];
  const { data, error } = await supabase
    .from("productos")
    .select(CAMPOS_PRODUCTO)
    .eq("categoria_id", producto.categoria.id)
    .neq("id", producto.id)
    .limit(limite);
  registrarError("obtenerRelacionados", error);
  return data || [];
}
