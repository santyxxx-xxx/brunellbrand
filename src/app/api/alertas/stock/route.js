import { NextResponse } from "next/server";
import { obtenerClienteAdmin } from "@/lib/supabase/admin";
import { enviarAlertasStock } from "@/lib/alertas";
import { urlSitio } from "@/lib/sitio";

export const dynamic = "force-dynamic";

// Envía las alertas de stock pendientes. Lo llaman el panel después de una venta
// o de editar stock, y un respaldo diario de Vercel Cron. Solo puede enviar
// alertas que la base de datos ya anotó, así que no hace falta clave.
async function procesar(request) {
  try {
    const r = await enviarAlertasStock(obtenerClienteAdmin(), urlSitio(request));
    return NextResponse.json({ ok: !r.error, ...r });
  } catch (error) {
    console.error("[alertas/stock]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export const GET = procesar;
export const POST = procesar;
