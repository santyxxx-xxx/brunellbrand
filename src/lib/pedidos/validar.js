import { PROVINCIAS } from "@/config/envios";
import { TIENDA } from "@/config/tienda";

function texto(valor, max = 200) {
  return String(valor ?? "").trim().replace(/\s+/g, " ").slice(0, max);
}

// Valida y limpia los datos del cliente que llegan desde el checkout
export function validarCliente(entrada = {}) {
  const c = {
    nombre: texto(entrada.nombre, 120),
    cedula: texto(entrada.cedula, 13).replace(/\D/g, ""),
    correo: texto(entrada.correo, 160).toLowerCase(),
    telefono: texto(entrada.telefono, 20).replace(/[^\d+]/g, ""),
    provincia: texto(entrada.provincia, 60),
    ciudad: texto(entrada.ciudad, 80),
    sector: texto(entrada.sector, 120),
    direccion: texto(entrada.direccion, 250),
    referencia: texto(entrada.referencia, 250),
    notas: texto(entrada.notas, 500),
  };

  const errores = {};
  if (c.nombre.length < 3) errores.nombre = "Ingresa tu nombre completo.";
  if (c.cedula && !(c.cedula.length === 10 || c.cedula.length === 13)) {
    errores.cedula = "La cédula debe tener 10 dígitos (o 13 si es RUC).";
  }
  // Con pedidos por WhatsApp el correo es opcional; con pago en línea, obligatorio (ahí llega el comprobante)
  if ((TIENDA.pagoEnLinea || c.correo) && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c.correo)) errores.correo = "Ingresa un correo válido.";
  if (c.telefono.replace(/\D/g, "").length < 9) errores.telefono = "Ingresa un teléfono válido (ej: 0991234567).";
  if (!PROVINCIAS.includes(c.provincia)) errores.provincia = "Elige tu provincia.";
  if (c.ciudad.length < 2) errores.ciudad = "Ingresa tu ciudad.";
  if (c.sector.length < 2) errores.sector = "Ingresa tu sector o barrio.";
  if (c.direccion.length < 5) errores.direccion = "Ingresa tu dirección (calle principal, número y secundaria).";

  return { ok: Object.keys(errores).length === 0, errores, cliente: c };
}

// Valida la lista de productos que manda el carrito (solo ids, tallas y cantidades)
export function validarItems(entrada) {
  if (!Array.isArray(entrada) || entrada.length === 0) return { ok: false, error: "Tu carrito está vacío." };
  if (entrada.length > 30) return { ok: false, error: "Demasiados productos en un solo pedido." };

  const agrupados = new Map();
  for (const item of entrada) {
    const productoId = String(item?.productoId || "");
    const talla = String(item?.talla || "").toUpperCase();
    const cantidad = parseInt(item?.cantidad, 10);
    if (!/^[0-9a-f-]{36}$/i.test(productoId) || !talla || !Number.isFinite(cantidad) || cantidad < 1) {
      return { ok: false, error: "Hay un producto inválido en tu carrito. Vacíalo y vuelve a agregarlo." };
    }
    const clave = `${productoId}|${talla}`;
    agrupados.set(clave, { productoId, talla, cantidad: Math.min(10, (agrupados.get(clave)?.cantidad || 0) + cantidad) });
  }
  return { ok: true, items: [...agrupados.values()] };
}
