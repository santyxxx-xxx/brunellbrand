"use client";

import { obtenerClienteNavegador } from "@/lib/supabase/cliente";

const BUCKET = "productos";

// Refresca la tienda pública después de un cambio en el panel
// y envía las alertas de stock que hayan quedado pendientes
export async function refrescarTienda() {
  try {
    await Promise.all([fetch("/api/revalidar", { method: "POST" }), fetch("/api/alertas/stock", { method: "POST" })]);
  } catch {
    /* si falla, la tienda se actualiza sola en máximo 60 segundos */
  }
}

// Reduce la foto antes de subirla: máximo 1200 px por lado y formato WebP (≈ 80–200 KB).
// Si el navegador no puede crear WebP (iPhone antiguo), usa JPEG.
export async function comprimirImagen(archivo, ladoMaximo = 1200, calidad = 0.8) {
  if (!archivo.type.startsWith("image/") || archivo.type === "image/gif") return archivo;
  try {
    const bitmap = await createImageBitmap(archivo);
    const escala = Math.min(1, ladoMaximo / Math.max(bitmap.width, bitmap.height));
    const ancho = Math.round(bitmap.width * escala);
    const alto = Math.round(bitmap.height * escala);
    const lienzo = document.createElement("canvas");
    lienzo.width = ancho;
    lienzo.height = alto;
    const ctx = lienzo.getContext("2d");
    ctx.fillStyle = "#ffffff"; // fondo blanco por si la foto tiene transparencia
    ctx.fillRect(0, 0, ancho, alto);
    ctx.drawImage(bitmap, 0, 0, ancho, alto);

    const crear = (tipo) => new Promise((resolver) => lienzo.toBlob(resolver, tipo, calidad));
    let blob = await crear("image/webp");
    let extension = "webp";
    if (!blob || blob.type !== "image/webp") {
      blob = await crear("image/jpeg");
      extension = "jpg";
    }
    if (!blob || blob.size >= archivo.size) return archivo;
    return new File([blob], `${archivo.name.replace(/\.\w+$/, "")}.${extension}`, { type: blob.type });
  } catch {
    return archivo;
  }
}

// Sube una foto al bucket "productos" y devuelve su URL pública
export async function subirFoto(archivo, carpeta) {
  const supabase = obtenerClienteNavegador();
  const comprimida = await comprimirImagen(archivo);
  const extension = (comprimida.name.split(".").pop() || "jpg").toLowerCase();
  const ruta = `${carpeta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
  const { error } = await supabase.storage.from(BUCKET).upload(ruta, comprimida, {
    cacheControl: "31536000",
    contentType: comprimida.type,
    upsert: false,
  });
  if (error) throw new Error(`No se pudo subir la foto: ${error.message}`);
  return supabase.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl;
}

// Borra del bucket las fotos que pertenecen a Supabase Storage
export async function borrarFotos(urls = []) {
  const supabase = obtenerClienteNavegador();
  const marcador = `/storage/v1/object/public/${BUCKET}/`;
  const rutas = urls
    .filter((u) => typeof u === "string" && u.includes(marcador))
    .map((u) => decodeURIComponent(u.split(marcador)[1]));
  if (rutas.length) await supabase.storage.from(BUCKET).remove(rutas);
}
