import { NextResponse } from "next/server";
import { obtenerClienteAdmin } from "@/lib/supabase/admin";
import { confirmarPago } from "@/lib/pedidos/servidor";
import { leerRetorno } from "@/lib/pagos/payphone";
import { urlSitio } from "@/lib/sitio";

export const dynamic = "force-dynamic";

// PayPhone envía aquí al cliente después de pagar (?id=...&clientTransactionId=...).
// Verificamos el pago con PayPhone (servidor a servidor) y mostramos el pedido.
export async function GET(request) {
  const base = urlSitio(request);
  const datos = leerRetorno(request.nextUrl.searchParams);

  let destino = `${base}/`;
  try {
    const admin = obtenerClienteAdmin();
    const { pedido, aprobado } = await confirmarPago(admin, datos, base);
    if (pedido) {
      destino = `${base}/pedido/${pedido.id}?t=${pedido.token_acceso}&pago=${aprobado ? "ok" : "fallido"}`;
    }
  } catch (error) {
    console.error("[payphone/retorno]", error);
  }
  return NextResponse.redirect(destino, { status: 303 });
}
