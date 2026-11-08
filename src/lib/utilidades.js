import { TALLAS } from "@/config/tienda";

// Precio en dólares con formato de Ecuador: $25,90
export function formatearPrecio(valor) {
  const numero = Number(valor) || 0;
  return new Intl.NumberFormat("es-EC", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(numero);
}

// "Camisa Oxford Azul" -> "camisa-oxford-azul"
export function crearSlug(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ñ/g, "n")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Slug único del producto: nombre + código
export function slugProducto(nombre, sku) {
  return crearSlug(`${nombre}-${sku}`);
}

// Convierte "25,90" o "25.90" en 25.9
export function aNumero(valor) {
  if (valor === null || valor === undefined || valor === "") return null;
  const limpio = String(valor).trim().replace(/[$\s]/g, "").replace(",", ".");
  const numero = Number(limpio);
  return Number.isFinite(numero) ? numero : null;
}

// Enlace de WhatsApp con mensaje pre-escrito
export function enlaceWhatsApp(numero, mensaje) {
  const limpio = String(numero || "").replace(/\D/g, "");
  return `https://wa.me/${limpio}?text=${encodeURIComponent(mensaje)}`;
}

// Deja solo las tallas que maneja la tienda (S, M, L) y las ordena
export function ordenarTallas(tallas = []) {
  return tallas.filter((t) => TALLAS.includes(t.talla)).sort((a, b) => TALLAS.indexOf(a.talla) - TALLAS.indexOf(b.talla));
}

export function stockTotal(tallas = []) {
  return tallas.filter((t) => TALLAS.includes(t.talla)).reduce((suma, t) => suma + (Number(t.stock) || 0), 0);
}

// Nombre de la web con la marca al final: "Polo azul Ralph Lauren"
export function nombreWeb(producto) {
  if (!producto) return "";
  return producto.marca ? `${producto.nombre} ${producto.marca}` : producto.nombre;
}

// Nombre para el cliente con el estilo: "Camisa blanca (Oxford)"
export function nombreConOpcion(producto) {
  if (!producto) return "";
  return producto.opcion ? `${nombreWeb(producto)} (${producto.opcion})` : nombreWeb(producto);
}

// Nombre para el panel: el interno (con proveedor/jerga) si existe
export function nombreInterno(producto) {
  if (!producto) return "";
  return producto.nombre_interno || producto.nombre;
}

/**
 * Une en un solo modelo las prendas del mismo "grupo" (por ejemplo, la misma camisa
 * en Oxford y Casual, o repetida de dos proveedores). Respeta el orden recibido.
 * Cada modelo: { ...producto representativo, tallas sumadas, opciones, precioMin, precioMax, variantes }
 */
export function agruparModelos(productos = []) {
  const grupos = new Map();
  for (const p of productos) {
    const clave = p.grupo || p.id;
    if (!grupos.has(clave)) grupos.set(clave, []);
    grupos.get(clave).push(p);
  }
  return [...grupos.values()].map((variantes) => {
    const conStock = variantes.find((v) => stockTotal(v.tallas) > 0);
    const conFoto = variantes.find((v) => v.imagenes?.length);
    const base = conStock || variantes[0];
    const stockPorTalla = {};
    for (const v of variantes) {
      for (const t of v.tallas || []) stockPorTalla[t.talla] = (stockPorTalla[t.talla] || 0) + (Number(t.stock) || 0);
    }
    const precios = variantes.map((v) => Number(v.precio));
    const opciones = [...new Set(variantes.map((v) => v.opcion).filter(Boolean))].sort();
    return {
      ...base,
      imagenes: base.imagenes?.length ? base.imagenes : conFoto?.imagenes || [],
      tallas: Object.entries(stockPorTalla).map(([talla, stock]) => ({ talla, stock })),
      opciones,
      precioMin: Math.min(...precios),
      precioMax: Math.max(...precios),
      variantes,
    };
  });
}
