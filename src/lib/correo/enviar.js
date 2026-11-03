// Envío de correos con Resend (https://resend.com) usando su API REST.
// Para cambiar de proveedor, solo hay que modificar esta función.

export async function enviarCorreo({ para, asunto, html, responderA }) {
  const clave = (process.env.RESEND_API_KEY || "").trim();
  const remitente = (process.env.EMAIL_FROM || "").trim();
  if (!clave || !remitente) {
    console.warn("[correo] Falta RESEND_API_KEY o EMAIL_FROM; no se envió:", asunto);
    return { ok: false, error: "Correo no configurado" };
  }

  try {
    const respuesta = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${clave}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: remitente,
        to: Array.isArray(para) ? para : [para],
        subject: asunto,
        html,
        reply_to: responderA || undefined,
      }),
      cache: "no-store",
    });
    if (!respuesta.ok) {
      const detalle = await respuesta.text();
      console.error("[correo] Resend respondió con error:", respuesta.status, detalle);
      return { ok: false, error: detalle };
    }
    return { ok: true };
  } catch (error) {
    console.error("[correo] No se pudo enviar:", error.message);
    return { ok: false, error: error.message };
  }
}

// Correos del equipo (EMAIL_ADMIN admite varios separados por coma)
export function correosAdmin() {
  return (process.env.EMAIL_ADMIN || "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

// Primer correo del equipo (se usa como "responder a")
export function correoAdmin() {
  return correosAdmin()[0] || "";
}
