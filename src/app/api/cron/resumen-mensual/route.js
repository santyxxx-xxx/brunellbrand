import { NextResponse } from "next/server";
import { obtenerClienteAdmin } from "@/lib/supabase/admin";
import { resumenMensual } from "@/lib/correo/plantillas";
import { enviarCorreo, correosAdmin } from "@/lib/correo/enviar";
import { urlSitio } from "@/lib/sitio";
import { leerConfigReposicion } from "@/lib/reposicion";

export const dynamic = "force-dynamic";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

// Correo "Resumen del mes" para el equipo. Vercel lo llama el día 1 de cada mes
// (08:00 Ecuador) con "Authorization: Bearer <CRON_SECRET>" y resume el mes anterior.
// Para probarlo: Vercel > Settings > Cron Jobs > Run. Con ?mes=actual resume el mes en curso.
export async function GET(request) {
  const secreto = (process.env.CRON_SECRET || "").trim();
  if (!secreto || request.headers.get("authorization") !== `Bearer ${secreto}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const destinatarios = correosAdmin();
  if (!destinatarios.length) return NextResponse.json({ ok: false, error: "Falta EMAIL_ADMIN" }, { status: 500 });

  // Fecha de hoy en Ecuador
  const ahora = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Guayaquil" }));
  const actual = request.nextUrl.searchParams.get("mes") === "actual";
  const ref = actual ? ahora : new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1);
  const anio = ref.getFullYear();
  const mes = ref.getMonth();
  const dos = (n) => String(n).padStart(2, "0");
  const desde = `${anio}-${dos(mes + 1)}-01`;
  const hasta = actual
    ? `${anio}-${dos(mes + 1)}-${dos(ahora.getDate())}`
    : `${anio}-${dos(mes + 1)}-${dos(new Date(anio, mes + 1, 0).getDate())}`;

  try {
    const supabase = obtenerClienteAdmin();
    const config = await leerConfigReposicion(supabase);
    if (!config.correoActivo) return NextResponse.json({ ok: true, omitido: "Resumen desactivado en Por reponer" });
    const { data, error } = await supabase.rpc("balance_datos", { p_desde: desde, p_hasta: hasta });
    if (error) throw error;
    const correo = resumenMensual({ d: data, mesNombre: `${MESES[mes]} ${anio}`, urlSitio: urlSitio(request) });
    const r = await enviarCorreo({ para: destinatarios, asunto: correo.asunto, html: correo.html });
    return NextResponse.json({ ok: r.ok, mes: `${MESES[mes]} ${anio}`, error: r.error || undefined });
  } catch (error) {
    console.error("[cron/resumen-mensual]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
