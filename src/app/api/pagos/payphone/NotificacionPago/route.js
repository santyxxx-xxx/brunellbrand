import { NextResponse } from "next/server";
import { obtenerClienteAdmin } from "@/lib/supabase/admin";
import { confirmarPago } from "@/lib/pedidos/servidor";
import { leerNotificacion } from "@/lib/pagos/payphone";
import { urlSitio } from "@/lib/sitio";

export const dynamic = "force-dynamic";

// Webhook "Notificación externa" de PayPhone (requiere activación por PayPhone).
// URL a registrar: https://TU-DOMINIO/api/pagos/payphone/NotificacionPago
//
// PayPhone no firma este aviso, así que NO confiamos en su contenido:
// solo tomamos los identificadores y volvemos a consultar el pago a PayPhone con nuestro token.
// Esto también cubre el caso en que el cliente pagó pero cerró el navegador antes de volver.
export async function POST(request) {
  let cuerpo;
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ Response: false, ErrorCode: "111" });
  }

  const datos = leerNotificacion(cuerpo);
  if (!datos.transaccionId || !datos.clientTransactionId) {
    return NextResponse.json({ Response: false, ErrorCode: "444" });
  }

  try {
    const admin = obtenerClienteAdmin();
    await confirmarPago(admin, datos, urlSitio(request));
    return NextResponse.json({ Response: true, ErrorCode: "000" });
  } catch (error) {
    console.error("[payphone/notificacion]", error);
    return NextResponse.json({ Response: false, ErrorCode: "222" });
  }
}
