import { NextResponse } from "next/server";
import { obtenerClienteAdmin } from "@/lib/supabase/admin";
import { leerConfigReposicion, obtenerPorReponer } from "@/lib/reposicion";
import { reporteReposicion } from "@/lib/correo/plantillas";
import { enviarCorreo, correosAdmin } from "@/lib/correo/enviar";
import { urlSitio } from "@/lib/sitio";

export const dynamic = "force-dynamic";

// Correo mensual "Por reponer".
// Vercel lo llama el día 1 de cada mes (08:00 Ecuador) según vercel.json ("crons") y envía
// "Authorization: Bearer <CRON_SECRET>". Sin ese secreto, no se ejecuta.
export async function GET(request) {
  const secreto = (process.env.CRON_SECRET || "").trim();
  if (!secreto || request.headers.get("authorization") !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const destinatarios = correosAdmin();
  if (!destinatarios.length) return NextResponse.json({ ok: false, error: "Falta EMAIL_ADMIN" }, { status: 500 });

  try {
    const supabase = obtenerClienteAdmin();
    const config = await leerConfigReposicion(supabase);
    if (!config.correoActivo) return NextResponse.json({ ok: true, omitido: "Correo desactivado en el panel" });

    const lista = await obtenerPorReponer(supabase, config);
    const correo = reporteReposicion({ lista, umbral: config.umbral, urlSitio: urlSitio(request) });
    const r = await enviarCorreo({ para: destinatarios, asunto: correo.asunto, html: correo.html });
    return NextResponse.json({ ok: r.ok, productos: lista.length, error: r.error || undefined });
  } catch (error) {
    console.error("[cron/reposicion]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
