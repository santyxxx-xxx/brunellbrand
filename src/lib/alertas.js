// Envía por correo las alertas de stock pendientes (las crea la base de datos
// cuando una talla baja hasta el umbral). Solo servidor.
import { enviarCorreo, correosAdmin } from "@/lib/correo/enviar";
import { alertaStockBajo } from "@/lib/correo/plantillas";

export async function enviarAlertasStock(admin, urlSitio) {
  if (!correosAdmin().length) return { enviadas: 0 };

  // Se marcan como enviadas primero, para que dos llamadas seguidas no dupliquen el correo
  const ahora = new Date().toISOString();
  const { data: pendientes, error } = await admin
    .from("alertas_stock")
    .update({ enviado_en: ahora })
    .is("enviado_en", null)
    .select("id, producto_id, talla, stock_anterior, stock");
  if (error || !pendientes?.length) return { enviadas: 0, error: error?.message };

  const ids = [...new Set(pendientes.map((a) => a.producto_id))];
  const [{ data: productos }, { data: tallas }] = await Promise.all([
    admin.from("productos").select("*").in("id", ids),
    admin.from("producto_tallas").select("producto_id, talla, stock").in("producto_id", ids),
  ]);
  const prod = new Map((productos || []).map((p) => [p.id, p]));

  // Una alerta por producto y talla (la más reciente), con el stock actual
  const unicas = new Map();
  for (const a of pendientes) unicas.set(`${a.producto_id}-${a.talla}`, a);
  const alertas = [...unicas.values()].map((a) => ({
    ...a,
    nombre: prod.get(a.producto_id)?.nombre_interno || prod.get(a.producto_id)?.nombre || "Producto",
    sku: prod.get(a.producto_id)?.sku || "",
    stock_actual: (tallas || []).find((t) => t.producto_id === a.producto_id && t.talla === a.talla)?.stock ?? a.stock,
  }));

  const correo = alertaStockBajo({ alertas, urlSitio });
  const r = await enviarCorreo({ para: correosAdmin(), asunto: correo.asunto, html: correo.html });
  if (!r.ok) {
    await admin.from("alertas_stock").update({ enviado_en: null }).in("id", pendientes.map((a) => a.id));
    return { enviadas: 0, error: r.error };
  }
  return { enviadas: alertas.length };
}
