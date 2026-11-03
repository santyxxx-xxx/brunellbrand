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
