// =====================================================================
// Punto único de acceso a la pasarela de pagos.
// Para cambiar de pasarela: crea otro archivo con las mismas funciones
// (crearPago, verificarPago, leerRetorno, leerNotificacion) y regístralo aquí.
// Se elige con la variable de entorno PASARELA_PAGOS (por defecto "payphone").
// =====================================================================

import * as payphone from "./payphone";

const PASARELAS = { payphone };

export function obtenerPasarela() {
  const clave = (process.env.PASARELA_PAGOS || "payphone").trim().toLowerCase();
  const pasarela = PASARELAS[clave];
  if (!pasarela) throw new Error(`Pasarela de pagos desconocida: ${clave}`);
  return pasarela;
}

// Identificador único por intento de pago (PayPhone recomienda máximo 15 caracteres)
export function nuevoClientTransactionId(numeroPedido) {
  const azar = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `B${numeroPedido}-${azar}`;
}

export function aCentavos(valor) {
  return Math.round(Number(valor) * 100);
}
