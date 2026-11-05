import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { obtenerClienteAdmin } from "@/lib/supabase/admin";
import { verificarAdmin } from "@/lib/supabase/verificarAdmin";
import { enviarAvisoEnvio, enviarCorreosPago } from "@/lib/pedidos/servidor";
import { ESTADOS_PEDIDO } from "@/config/envios";
import { enviarAlertasStock } from "@/lib/alertas";
import { urlSitio } from "@/lib/sitio";

export const dynamic = "force-dynamic";

// Acciones del panel sobre un pedido:
//  { accion: "actualizar", estado, numeroGuia, notasInternas, notificarCliente }
//  { accion: "reenviarComprobante" }
export async function POST(request, { params }) {
  const usuario = await verificarAdmin();
  if (!usuario) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const { id } = await params;
  const cuerpo = await request.json().catch(() => ({}));
  const admin = obtenerClienteAdmin();
  const base = urlSitio(request);

  const { data: anterior } = await admin.from("orders").select("*").eq("id", id).maybeSingle();
  if (!anterior) return NextResponse.json({ error: "Pedido no encontrado." }, { status: 404 });

  if (cuerpo.accion === "reenviarComprobante") {
    if (!["pagado", "enviado", "entregado"].includes(anterior.estado)) {
      return NextResponse.json({ error: "Solo se envía comprobante a pedidos pagados." }, { status: 409 });
    }
    await admin.from("orders").update({ correos_enviados: false }).eq("id", id);
    await enviarCorreosPago(admin, { ...anterior, correos_enviados: false }, base);
    return NextResponse.json({ ok: true, mensaje: "Comprobante reenviado." });
  }

  const cambios = {};
  if (cuerpo.estado !== undefined) {
    if (!ESTADOS_PEDIDO[cuerpo.estado]) return NextResponse.json({ error: "Estado inválido." }, { status: 400 });
    cambios.estado = cuerpo.estado;
  }
  if (["efectivo", "transferencia", "tarjeta"].includes(cuerpo.metodoPago)) cambios.metodo_pago = cuerpo.metodoPago;
  if (cuerpo.numeroGuia !== undefined) cambios.numero_guia = String(cuerpo.numeroGuia).trim().slice(0, 60) || null;
  if (cuerpo.notasInternas !== undefined) cambios.notas_internas = String(cuerpo.notasInternas).slice(0, 2000) || null;

  // El trigger de la base de datos descuenta o devuelve stock según el cambio de estado
  const { data: pedido, error } = await admin.from("orders").update(cambios).eq("id", id).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const avisos = [];
  const cambioEstado = anterior.estado !== pedido.estado;
  if (cambioEstado) {
    revalidatePath("/", "layout"); // el stock pudo cambiar
    await enviarAlertasStock(admin, base).catch(() => {});
  }

  // Pago confirmado manualmente (por ejemplo, transferencia): enviar comprobante
  if (cambioEstado && pedido.estado === "pagado" && anterior.estado === "pendiente_pago") {
    await enviarCorreosPago(admin, pedido, base);
    avisos.push("Comprobante enviado al cliente.");
  }
  // Pedido despachado: avisar al cliente (con número de guía si existe)
  if (cambioEstado && pedido.estado === "enviado" && cuerpo.notificarCliente !== false) {
    const r = await enviarAvisoEnvio(pedido, base);
    avisos.push(r.ok ? "Aviso de envío enviado al cliente." : "No se pudo enviar el aviso de envío.");
  }

  return NextResponse.json({ ok: true, pedido, mensaje: ["Cambios guardados.", ...avisos].join(" ") });
}
