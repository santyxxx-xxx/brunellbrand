// =====================================================================
// Pasarela PayPhone · Botón de pagos por redirección
// Documentación: https://docs.payphone.app/boton-de-pago-por-redireccion
//
// Flujo:
//   1. crearPago()     -> POST /api/button/Prepare  -> URL de pago (payWithCard)
//   2. El cliente paga en PayPhone y vuelve a nuestra responseUrl con ?id=&clientTransactionId=
//   3. verificarPago() -> POST /api/button/V2/Confirm (servidor a servidor, con token)
//      ⚠️ PayPhone revierte el cobro si no se confirma en los primeros 5 minutos.
//   4. (Opcional) Notificación externa: PayPhone avisa a /api/pagos/payphone/NotificacionPago
//      y nosotros volvemos a verificar con Confirm (no confiamos en lo que llega en el aviso).
// =====================================================================

const URL_BASE = "https://pay.payphonetodoesposible.com/api";

function credenciales() {
  const token = (process.env.PAYPHONE_TOKEN || "").trim();
  const storeId = (process.env.PAYPHONE_STORE_ID || "").trim();
  if (!token || !storeId) {
    throw new Error("Faltan PAYPHONE_TOKEN o PAYPHONE_STORE_ID en las variables de entorno.");
  }
  return { token, storeId };
}

async function llamar(ruta, cuerpo) {
  const { token } = credenciales();
  const controlador = new AbortController();
  const limite = setTimeout(() => controlador.abort(), 20000);
  try {
    const respuesta = await fetch(`${URL_BASE}${ruta}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
      signal: controlador.signal,
      cache: "no-store",
    });
    const texto = await respuesta.text();
    let datos = null;
    try {
      datos = texto ? JSON.parse(texto) : null;
    } catch {
      datos = { message: texto };
    }
    if (!respuesta.ok) {
      const mensaje = datos?.message || datos?.Message || `HTTP ${respuesta.status}`;
      throw new Error(`PayPhone respondió con error: ${mensaje}`);
    }
    return datos;
  } finally {
    clearTimeout(limite);
  }
}

// Teléfono ecuatoriano a formato internacional (+593...)
function telefonoInternacional(telefono) {
  const digitos = String(telefono || "").replace(/\D/g, "");
  if (digitos.startsWith("593")) return `+${digitos}`;
  if (digitos.startsWith("0") && digitos.length === 10) return `+593${digitos.slice(1)}`;
  return undefined;
}

export const nombre = "payphone";

/**
 * Prepara el cobro y devuelve la URL a la que se envía al cliente.
 * @returns {Promise<{ url: string, referenciaExterna: string }>}
 */
export async function crearPago({ clientTransactionId, montoCentavos, referencia, urlRetorno, urlCancelacion, cliente }) {
  const { storeId } = credenciales();
  const datos = await llamar("/button/Prepare", {
    // Todo el valor se envía como "sin impuesto" (los precios de la tienda ya son finales).
    amount: montoCentavos,
    amountWithoutTax: montoCentavos,
    currency: "USD",
    clientTransactionId,
    storeId,
    reference: String(referencia || "").slice(0, 100),
    responseUrl: urlRetorno,
    cancellationUrl: urlCancelacion,
    timeZone: -5,
    email: cliente?.correo || undefined,
    phoneNumber: telefonoInternacional(cliente?.telefono),
    documentId: cliente?.cedula || undefined,
    lang: "es",
  });
  const url = datos?.payWithCard || datos?.payWithPayPhone;
  if (!url) throw new Error("PayPhone no devolvió una URL de pago.");
  return { url, referenciaExterna: String(datos.paymentId || "") };
}

/**
 * Confirma con PayPhone el resultado real de una transacción.
 * @returns {Promise<{ aprobado: boolean, estado: 'aprobado'|'cancelado', montoCentavos: number,
 *                     transaccionId: string, clientTransactionId: string, detalle: object }>}
 */
export async function verificarPago({ transaccionId, clientTransactionId }) {
  const id = parseInt(transaccionId, 10);
  if (!Number.isFinite(id) || !clientTransactionId) throw new Error("Datos de transacción incompletos.");
  const datos = await llamar("/button/V2/Confirm", { id, clientTxId: String(clientTransactionId) });
  const aprobado = Number(datos?.statusCode) === 3 || datos?.transactionStatus === "Approved";
  return {
    aprobado,
    estado: aprobado ? "aprobado" : "cancelado",
    montoCentavos: Number(datos?.amount) || 0,
    transaccionId: String(datos?.transactionId ?? id),
    clientTransactionId: String(datos?.clientTransactionId || clientTransactionId),
    detalle: limpiarDetalle(datos),
  };
}

/** Lee los identificadores del aviso de "Notificación externa" de PayPhone. */
export function leerNotificacion(cuerpo) {
  return {
    transaccionId: cuerpo?.TransactionId ?? cuerpo?.transactionId,
    clientTransactionId: cuerpo?.ClientTransactionId ?? cuerpo?.clientTransactionId,
  };
}

/** Lee los parámetros con los que PayPhone regresa a nuestra responseUrl. */
export function leerRetorno(parametros) {
  return {
    transaccionId: parametros.get("id"),
    clientTransactionId: parametros.get("clientTransactionId"),
  };
}

// Guarda solo datos útiles (nunca números de tarjeta completos; PayPhone tampoco los envía)
function limpiarDetalle(d) {
  if (!d) return null;
  return {
    statusCode: d.statusCode,
    transactionStatus: d.transactionStatus,
    transactionId: d.transactionId,
    clientTransactionId: d.clientTransactionId,
    authorizationCode: d.authorizationCode,
    amount: d.amount,
    cardBrand: d.cardBrand,
    lastDigits: d.lastDigits,
    deferred: d.deferred,
    message: d.message,
    date: d.date,
  };
}
