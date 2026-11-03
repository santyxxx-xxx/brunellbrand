// Plantillas HTML de correo con la identidad de Brunel Brand.
// Se usan estilos en línea y tablas porque es lo que mejor funciona en Gmail, Outlook y celulares.

import { TIENDA } from "@/config/tienda";
import { formatearPrecio } from "@/lib/utilidades";

const C = {
  marino: "#1F2A44",
  hueso: "#F5F1E8",
  blanco: "#FFFFFF",
  ocre: "#C99A2E",
  gris: "#6B7280",
};

function esc(texto) {
  return String(texto ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fecha(valor) {
  return new Date(valor || Date.now()).toLocaleString("es-EC", {
    timeZone: "America/Guayaquil",
    dateStyle: "long",
    timeStyle: "short",
  });
}

// Marco común: encabezado marino con el grifo, contenido blanco, pie hueso
function marco({ urlSitio, titulo, preencabezado, contenido }) {
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(titulo)}</title></head>
<body style="margin:0;padding:0;background:${C.hueso};font-family:Georgia,'Times New Roman',serif;color:${C.marino};">
<span style="display:none;max-height:0;overflow:hidden;">${esc(preencabezado)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.hueso};padding:24px 12px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${C.blanco};border-radius:14px;overflow:hidden;">
    <tr><td align="center" style="background:${C.marino};padding:28px 24px 22px;">
      <img src="${urlSitio}/marca/grifo-correo.png" width="62" height="72" alt="" style="display:block;border:0;margin:0 auto 12px;">
      <img src="${urlSitio}/marca/texto-correo.png" width="132" height="23" alt="${esc(TIENDA.marca)}" style="display:block;border:0;margin:0 auto;">
    </td></tr>
    <tr><td style="padding:28px 24px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:${C.marino};">
      ${contenido}
    </td></tr>
    <tr><td style="background:${C.hueso};padding:18px 24px;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:${C.gris};text-align:center;">
      ${esc(TIENDA.nombre)} · ${esc(TIENDA.ciudad)}<br>
      <a href="${urlSitio}" style="color:${C.ocre};">${esc(urlSitio.replace(/^https?:\/\//, ""))}</a>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

function tablaResumen(pedido, items) {
  const filas = items
    .map(
      (i) => `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #eee;">${esc(i.nombre)}<br>
          <span style="color:${C.gris};font-size:12px;">Talla ${esc(i.talla)} · ${i.cantidad} × ${formatearPrecio(i.precio_unitario)}</span></td>
        <td align="right" style="padding:10px 0;border-bottom:1px solid #eee;white-space:nowrap;">${formatearPrecio(i.subtotal)}</td>
      </tr>`
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">
    ${filas}
    <tr><td style="padding:10px 0 4px;">Subtotal</td><td align="right" style="padding:10px 0 4px;">${formatearPrecio(pedido.subtotal)}</td></tr>
    <tr><td style="padding:4px 0;">Envío · ${esc(pedido.envio_nombre)}</td><td align="right" style="padding:4px 0;">${formatearPrecio(pedido.costo_envio)}</td></tr>
    <tr><td style="padding:12px 0 0;font-weight:bold;font-size:16px;border-top:2px solid ${C.marino};">Total pagado</td>
        <td align="right" style="padding:12px 0 0;font-weight:bold;font-size:16px;border-top:2px solid ${C.marino};">${formatearPrecio(pedido.total)}</td></tr>
  </table>`;
}

function bloqueDireccion(pedido) {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.hueso};border-radius:10px;margin-top:20px;">
    <tr><td style="padding:16px;font-size:13px;">
      <div style="font-size:11px;letter-spacing:2px;color:${C.ocre};font-weight:bold;margin-bottom:6px;">DATOS DE ENTREGA</div>
      <strong>${esc(pedido.cliente_nombre)}</strong>${pedido.cliente_cedula ? ` · C.I. ${esc(pedido.cliente_cedula)}` : ""}<br>
      ${esc(pedido.cliente_telefono)} · ${esc(pedido.cliente_correo)}<br>
      ${esc(pedido.direccion)}, ${esc(pedido.sector)}<br>
      ${esc(pedido.ciudad)}, ${esc(pedido.provincia)}
      ${pedido.referencia ? `<br><span style="color:${C.gris};">Ref.: ${esc(pedido.referencia)}</span>` : ""}
    </td></tr>
  </table>`;
}

function boton(url, texto) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 0;"><tr>
    <td style="background:${C.ocre};border-radius:999px;"><a href="${url}" style="display:inline-block;padding:12px 26px;color:#fff;text-decoration:none;font-weight:bold;font-size:14px;">${esc(texto)}</a></td>
  </tr></table>`;
}

/** Comprobante de compra para el cliente (NO es factura). */
export function comprobanteCliente({ pedido, items, urlSitio }) {
  const enlace = `${urlSitio}/pedido/${pedido.id}?t=${pedido.token_acceso}`;
  const contenido = `
    <h1 style="font-family:Georgia,serif;font-weight:normal;font-size:24px;margin:0 0 6px;">¡Gracias por tu compra, ${esc(pedido.cliente_nombre.split(" ")[0])}!</h1>
    <p style="margin:0 0 18px;color:${C.gris};">Recibimos tu pago. Este es tu <strong style="color:${C.marino};">comprobante de compra</strong>.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;font-size:13px;">
      <tr><td>Pedido <strong>#${pedido.numero}</strong></td><td align="right" style="color:${C.gris};">${fecha(pedido.pagado_en)}</td></tr>
    </table>
    ${tablaResumen(pedido, items)}
    ${bloqueDireccion(pedido)}
    <p style="margin:20px 0 0;">Te avisaremos cuando tu pedido sea despachado.</p>
    ${boton(enlace, "Ver mi pedido")}
    <p style="margin:24px 0 0;font-size:11px;color:${C.gris};">Este comprobante de compra no tiene validez tributaria.</p>`;
  return {
    asunto: `Comprobante de compra · Pedido #${pedido.numero} · ${TIENDA.nombre}`,
    html: marco({ urlSitio, titulo: "Comprobante de compra", preencabezado: `Pedido #${pedido.numero} confirmado`, contenido }),
  };
}

/** Aviso para el dueño: nuevo pedido pagado. */
export function avisoAdmin({ pedido, items, urlSitio }) {
  const enlace = `${urlSitio}/admin/pedidos/${pedido.id}`;
  const alerta = pedido.stock_insuficiente
    ? `<p style="background:#FEE2E2;color:#991B1B;padding:12px;border-radius:8px;margin:0 0 16px;"><strong>Atención:</strong> al confirmar el pago no había stock suficiente de algún producto. Revisa el pedido.</p>`
    : "";
  const contenido = `
    <h1 style="font-family:Georgia,serif;font-weight:normal;font-size:22px;margin:0 0 6px;">Nuevo pedido pagado #${pedido.numero}</h1>
    <p style="margin:0 0 18px;color:${C.gris};">${fecha(pedido.pagado_en)} · ${esc(pedido.envio_nombre)}</p>
    ${alerta}
    ${tablaResumen(pedido, items)}
    ${bloqueDireccion(pedido)}
    ${pedido.notas_cliente ? `<p style="margin-top:16px;"><strong>Nota del cliente:</strong> ${esc(pedido.notas_cliente)}</p>` : ""}
    ${boton(enlace, "Abrir en el panel")}`;
  return {
    asunto: `🛍️ Nuevo pedido #${pedido.numero} · ${formatearPrecio(pedido.total)}`,
    html: marco({ urlSitio, titulo: "Nuevo pedido", preencabezado: `Pedido #${pedido.numero} pagado`, contenido }),
  };
}

/** Aviso al cliente cuando su pedido se despacha. */
export function avisoEnvio({ pedido, urlSitio }) {
  const enlace = `${urlSitio}/pedido/${pedido.id}?t=${pedido.token_acceso}`;
  const guia = pedido.numero_guia
    ? `<p style="background:${C.hueso};padding:14px;border-radius:10px;text-align:center;margin:18px 0;">
         Número de guía Servientrega<br><strong style="font-size:20px;letter-spacing:2px;">${esc(pedido.numero_guia)}</strong><br>
         <a href="https://www.servientrega.com.ec/rastreo" style="color:${C.ocre};font-size:12px;">Rastrear en Servientrega</a></p>`
    : "";
  const contenido = `
    <h1 style="font-family:Georgia,serif;font-weight:normal;font-size:22px;margin:0 0 6px;">Tu pedido #${pedido.numero} va en camino</h1>
    <p style="margin:0;color:${C.gris};">Despachamos tu pedido por <strong style="color:${C.marino};">${esc(pedido.envio_nombre)}</strong>.</p>
    ${guia}
    ${bloqueDireccion(pedido)}
    ${boton(enlace, "Ver mi pedido")}`;
  return {
    asunto: `Tu pedido #${pedido.numero} fue enviado · ${TIENDA.nombre}`,
    html: marco({ urlSitio, titulo: "Pedido enviado", preencabezado: `Pedido #${pedido.numero} en camino`, contenido }),
  };
}

/** Reporte mensual de stock bajo para el equipo. */
export function reporteReposicion({ lista, umbral, urlSitio }) {
  const filas = lista
    .map(
      (p) => `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #eee;">${esc(p.nombre)}<br>
          <span style="color:${C.gris};font-size:11px;">${esc(p.categoria || "Sin categoría")} · ${esc(p.sku)}</span></td>
        <td align="right" style="padding:10px 0;border-bottom:1px solid #eee;font-size:12px;white-space:nowrap;">
          ${p.tallas
            .map(
              (t) =>
                `<span style="display:inline-block;margin:2px 0 2px 4px;padding:2px 8px;border-radius:99px;background:${t.stock === 0 ? "#FEE2E2" : "#FEF3C7"};color:${t.stock === 0 ? "#991B1B" : "#92400E"};font-weight:bold;">${esc(t.talla)}: ${t.stock}</span>`
            )
            .join("")}
        </td>
      </tr>`
    )
    .join("");
  const totalTallas = lista.reduce((s, p) => s + p.tallas.length, 0);
  const contenido = lista.length
    ? `<h1 style="font-family:Georgia,serif;font-weight:normal;font-size:22px;margin:0 0 6px;">Prendas por reponer</h1>
       <p style="margin:0 0 18px;color:${C.gris};">${lista.length} productos y ${totalTallas} tallas con stock de ${umbral} o menos · ${fecha()}</p>
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">${filas}</table>
       ${boton(`${urlSitio}/admin/reponer`, "Ver en el panel")}`
    : `<h1 style="font-family:Georgia,serif;font-weight:normal;font-size:22px;margin:0 0 6px;">Todo en orden</h1>
       <p style="margin:0;color:${C.gris};">Esta semana no hay tallas con stock de ${umbral} o menos.</p>`;
  return {
    asunto: lista.length
      ? `📦 Por reponer: ${lista.length} productos con stock bajo · ${TIENDA.nombre}`
      : `✅ Stock en orden esta semana · ${TIENDA.nombre}`,
    html: marco({ urlSitio, titulo: "Por reponer", preencabezado: `${totalTallas} tallas por reponer`, contenido }),
  };
}

/** Alerta inmediata: una o varias tallas acaban de bajar al umbral de stock. */
export function alertaStockBajo({ alertas, urlSitio }) {
  const filas = alertas
    .map(
      (a) => `<tr>
        <td style="padding:12px 0;border-bottom:1px solid #eee;">
          <a href="${urlSitio}/admin/productos/${a.producto_id}" style="color:${C.marino};text-decoration:none;font-weight:bold;">${esc(a.nombre)}</a><br>
          <span style="color:${C.gris};font-size:11px;">${esc(a.sku)} · bajó de ${a.stock_anterior} a ${a.stock}</span></td>
        <td align="right" style="padding:12px 0;border-bottom:1px solid #eee;white-space:nowrap;">
          <span style="display:inline-block;padding:4px 10px;border-radius:99px;background:${a.stock_actual === 0 ? "#FEE2E2" : "#FEF3C7"};color:${a.stock_actual === 0 ? "#991B1B" : "#92400E"};font-weight:bold;font-size:13px;">
            Talla ${esc(a.talla)}: quedan ${a.stock_actual}</span></td>
      </tr>`
    )
    .join("");
  const primera = alertas[0];
  const contenido = `
    <h1 style="font-family:Georgia,serif;font-weight:normal;font-size:22px;margin:0 0 6px;">${
      alertas.length === 1 ? "Una talla se está acabando" : `${alertas.length} tallas se están acabando`
    }</h1>
    <p style="margin:0 0 16px;color:${C.gris};">Es buen momento para pedir al proveedor.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;">${filas}</table>
    ${boton(`${urlSitio}/admin/reponer`, "Ver Por reponer")}`;
  return {
    asunto:
      alertas.length === 1
        ? `⚠️ Quedan ${primera.stock_actual}: ${primera.nombre} talla ${primera.talla}`
        : `⚠️ ${alertas.length} tallas por agotarse · ${TIENDA.nombre}`,
    html: marco({ urlSitio, titulo: "Stock bajo", preencabezado: "Prendas por agotarse", contenido }),
  };
}
