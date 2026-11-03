// Lógica para convertir las filas del CSV en productos listos para guardar.
// Columnas aceptadas (no importan mayúsculas ni tildes):
//   sku | codigo, nombre, descripcion, precio, precio_anterior, costo, categoria,
//   destacado, activo, stock_s, stock_m, stock_l, stock_xl (o simplemente s, m, l, xl),
//   imagenes (URLs separadas por "|")

import { TALLAS } from "@/config/tienda";
import { aNumero, crearSlug, slugProducto } from "@/lib/utilidades";

// "Precio Anterior" -> "precio_anterior", "Código" -> "codigo"
export function normalizarEncabezado(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function aBooleano(valor, porDefecto) {
  if (valor === undefined || valor === null || String(valor).trim() === "") return porDefecto;
  return ["si", "sí", "s", "yes", "y", "true", "1", "x"].includes(String(valor).trim().toLowerCase());
}

function leerStock(fila, talla) {
  const t = talla.toLowerCase();
  const valor = fila[`stock_${t}`] ?? fila[t] ?? fila[`talla_${t}`];
  const numero = parseInt(String(valor ?? "").trim(), 10);
  return Number.isFinite(numero) && numero > 0 ? numero : 0;
}

// filas: arreglo de objetos { encabezado: valor } tal como lo entrega el lector de CSV
export function procesarFilas(filasCrudas) {
  const productos = [];
  const errores = [];
  const vistos = new Set();

  filasCrudas.forEach((cruda, indice) => {
    const numeroFila = indice + 2; // +1 por el encabezado, +1 porque Excel empieza en 1
    const fila = {};
    Object.entries(cruda || {}).forEach(([clave, valor]) => {
      fila[normalizarEncabezado(clave)] = typeof valor === "string" ? valor.trim() : valor;
    });

    // Fila vacía: se ignora
    if (Object.values(fila).every((v) => v === "" || v === null || v === undefined)) return;

    const sku = String(fila.sku || fila.codigo || "").trim();
    const nombre = String(fila.nombre || "").trim();
    const precio = aNumero(fila.precio);

    if (!sku) return errores.push(`Fila ${numeroFila}: falta el código (sku).`);
    if (!nombre) return errores.push(`Fila ${numeroFila}: falta el nombre.`);
    if (precio === null || precio < 0) return errores.push(`Fila ${numeroFila}: precio inválido ("${fila.precio ?? ""}").`);
    if (vistos.has(sku.toLowerCase())) return errores.push(`Fila ${numeroFila}: el código "${sku}" está repetido en el archivo.`);
    vistos.add(sku.toLowerCase());

    const imagenes = String(fila.imagenes || fila.fotos || "")
      .split(/[|\n]/)
      .map((u) => u.trim())
      .filter((u) => /^https?:\/\//i.test(u));

    productos.push({
      sku,
      nombre,
      slug: slugProducto(nombre, sku),
      descripcion: String(fila.descripcion || "").trim() || null,
      precio,
      precio_anterior: aNumero(fila.precio_anterior),
      costo: aNumero(fila.costo ?? fila.costo_unitario),
      categoria: String(fila.categoria || "").trim(),
      destacado: aBooleano(fila.destacado, false),
      activo: aBooleano(fila.activo, true),
      imagenes,
      stock: Object.fromEntries(TALLAS.map((t) => [t, leerStock(fila, t)])),
    });
  });

  const categorias = [...new Set(productos.map((p) => p.categoria).filter(Boolean))];
  return { productos, errores, categorias };
}

// Agrupa en lotes para no enviar todo en una sola petición
export function enLotes(lista, tamano = 50) {
  const lotes = [];
  for (let i = 0; i < lista.length; i += tamano) lotes.push(lista.slice(i, i + tamano));
  return lotes;
}

export { crearSlug };
