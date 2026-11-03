// =====================================================================
// Lógica de pedidos en el SERVIDOR (nunca se importa en el navegador).
// Aquí se calculan precios, envío y totales con datos de la base de datos,
// se inician pagos y se confirman de forma segura e idempotente.
// =====================================================================

import { revalidatePath } from "next/cache";
import { obtenerPasarela, nuevoClientTransactionId, aCentavos } from "@/lib/pagos";
import { enviarCorreo, correoAdmin, correosAdmin } from "@/lib/correo/enviar";
import { comprobanteCliente, avisoAdmin, avisoEnvio } from "@/lib/correo/plantillas";
import { enviarAlertasStock } from "@/lib/alertas";

export class ErrorPedido extends Error {
  constructor(mensaje, estado = 400) {
    super(mensaje);
    this.estado = estado;
  }
}

const redondear = (n) => Math.round(n * 100) / 100;

/**
 * Calcula el pedido con los precios y el stock REALES de la base de datos.
 * Lo que mande el navegador (precios, totales) se ignora.
 */
export async function calcularPedido(admin, items, tarifaId, provincia) {
  const ids = [...new Set(items.map((i) => i.productoId))];
  const { data: productos, error } = await admin
    .from("productos")
    .select("id, sku, nombre, precio, imagenes, activo, tallas:producto_tallas(talla, stock)")
    .in("id", ids);
  if (error) throw new ErrorPedido("No pudimos revisar los productos. Intenta de nuevo.", 500);

  const porId = new Map((productos || []).map((p) => [p.id, p]));

  // Costos (solo para calcular la utilidad en el dashboard; nunca se muestran al cliente)
  const { data: costos } = await admin.from("productos_costos").select("producto_id, costo").in("producto_id", ids);
  const costoPorId = new Map((costos || []).map((c) => [c.producto_id, Number(c.costo)]));
  const lineas = [];
  const problemas = [];

  for (const item of items) {
    const producto = porId.get(item.productoId);
    if (!producto || !producto.activo) {
      problemas.push("Un producto de tu carrito ya no está disponible.");
      continue;
    }
    const talla = (producto.tallas || []).find((t) => t.talla === item.talla);
    const stock = talla?.stock || 0;
    if (stock < item.cantidad) {
      problemas.push(
        stock === 0
          ? `${producto.nombre} (talla ${item.talla}) está agotado.`
          : `${producto.nombre} (talla ${item.talla}): solo quedan ${stock} unidades.`
      );
      continue;
    }
    const precio = Number(producto.precio);
    lineas.push({
      producto_id: producto.id,
      sku: producto.sku,
      nombre: producto.nombre,
      talla: item.talla,
      imagen: producto.imagenes?.[0] || null,
      precio_unitario: precio,
      cantidad: item.cantidad,
      subtotal: redondear(precio * item.cantidad),
      costo_unitario: costoPorId.has(producto.id) ? costoPorId.get(producto.id) : null,
    });
  }

  if (problemas.length) throw new ErrorPedido(problemas.join(" "), 409);

  const { data: tarifa } = await admin
    .from("tarifas_envio")
    .select("id, metodo, provincia, nombre, costo, activo")
    .eq("id", tarifaId)
    .maybeSingle();
  if (!tarifa || !tarifa.activo || tarifa.provincia !== provincia) {
    throw new ErrorPedido("Elige una opción de envío válida para tu provincia.");
  }

  const subtotal = redondear(lineas.reduce((s, l) => s + l.subtotal, 0));
  const costoEnvio = redondear(Number(tarifa.costo));
  return { lineas, tarifa, subtotal, costoEnvio, total: redondear(subtotal + costoEnvio) };
}

/** Crea el pedido (pendiente de pago) con sus productos. */
export async function crearPedido(admin, { cliente, calculo, userId }) {
  const { data: pedido, error } = await admin
    .from("orders")
    .insert({
      user_id: userId || null,
      cliente_nombre: cliente.nombre,
      cliente_cedula: cliente.cedula || null,
      cliente_correo: cliente.correo,
      cliente_telefono: cliente.telefono,
      provincia: cliente.provincia,
      ciudad: cliente.ciudad,
      sector: cliente.sector,
      direccion: cliente.direccion,
      referencia: cliente.referencia || null,
      notas_cliente: cliente.notas || null,
      tarifa_envio_id: calculo.tarifa.id,
      envio_metodo: calculo.tarifa.metodo,
      envio_nombre: calculo.tarifa.nombre,
      costo_envio: calculo.costoEnvio,
      subtotal: calculo.subtotal,
      total: calculo.total,
      acepto_politicas_en: new Date().toISOString(),
      canal: "web",
      metodo_pago: "payphone",
    })
    .select("*")
    .single();
  if (error) throw new ErrorPedido("No pudimos registrar tu pedido. Intenta de nuevo.", 500);

  const { error: errorItems } = await admin
    .from("order_items")
    .insert(calculo.lineas.map((l) => ({ ...l, order_id: pedido.id })));
  if (errorItems) {
    await admin.from("orders").delete().eq("id", pedido.id);
    throw new ErrorPedido("No pudimos registrar los productos del pedido. Intenta de nuevo.", 500);
  }
  return pedido;
}

/**
 * Inicia un intento de pago en la pasarela. Si falla, el pedido queda
 * "pendiente de pago" y el cliente puede reintentar desde la página del pedido.
 * @returns {Promise<{ url: string|null, error?: string }>}
 */
export async function iniciarPago(admin, pedido, urlSitio) {
  const pasarela = obtenerPasarela();
  const clientTransactionId = nuevoClientTransactionId(pedido.numero);
  const montoCentavos = aCentavos(pedido.total);

  const { error } = await admin.from("order_payments").insert({
    order_id: pedido.id,
    pasarela: pasarela.nombre,
    client_transaction_id: clientTransactionId,
    monto_centavos: montoCentavos,
  });
  if (error) return { url: null, error: "No pudimos iniciar el pago." };

  try {
    const { url } = await pasarela.crearPago({
      clientTransactionId,
      montoCentavos,
      referencia: `Pedido #${pedido.numero} Brunel Brand`,
      urlRetorno: `${urlSitio}/api/pagos/${pasarela.nombre}/retorno`,
      urlCancelacion: `${urlSitio}/pedido/${pedido.id}?t=${pedido.token_acceso}&pago=cancelado`,
      cliente: { correo: pedido.cliente_correo, telefono: pedido.cliente_telefono, cedula: pedido.cliente_cedula },
    });
    return { url };
  } catch (e) {
    console.error("[pagos] Error al iniciar pago:", e.message);
    await admin
      .from("order_payments")
      .update({ estado: "error", detalle: { error: e.message } })
      .eq("client_transaction_id", clientTransactionId);
    return { url: null, error: "La pasarela de pagos no respondió. Tu pedido quedó guardado: puedes reintentar el pago." };
  }
}

/**
 * Verifica un pago con la pasarela (servidor a servidor) y, si está aprobado,
 * marca el pedido como pagado. Es idempotente: se puede llamar varias veces
 * (retorno del cliente + notificación) sin duplicar stock ni correos.
 * @returns {Promise<{ pedido: object|null, aprobado: boolean }>}
 */
export async function confirmarPago(admin, { transaccionId, clientTransactionId }, urlSitio) {
  if (!clientTransactionId) return { pedido: null, aprobado: false };

  const { data: pago } = await admin
    .from("order_payments")
    .select("id, order_id, monto_centavos, estado, pasarela")
    .eq("client_transaction_id", clientTransactionId)
    .maybeSingle();
  if (!pago) return { pedido: null, aprobado: false };

  const cargarPedido = async () =>
    (await admin.from("orders").select("*").eq("id", pago.order_id).single()).data;

  if (pago.estado === "aprobado") return { pedido: await cargarPedido(), aprobado: true };

  let resultado;
  try {
    resultado = await obtenerPasarela().verificarPago({ transaccionId, clientTransactionId });
  } catch (e) {
    console.error("[pagos] No se pudo verificar el pago:", e.message);
    return { pedido: await cargarPedido(), aprobado: false };
  }

  // El monto cobrado debe coincidir exactamente con el registrado
  const montoCorrecto = resultado.montoCentavos === pago.monto_centavos;
  const aprobado = resultado.aprobado && montoCorrecto;

  await admin
    .from("order_payments")
    .update({
      estado: aprobado ? "aprobado" : resultado.aprobado ? "error" : "cancelado",
      transaccion_id: resultado.transaccionId,
      detalle: { ...resultado.detalle, montoCorrecto },
    })
    .eq("id", pago.id);

  if (!aprobado) {
    if (resultado.aprobado && !montoCorrecto) {
      console.error(`[pagos] Monto no coincide en ${clientTransactionId}`);
    }
    return { pedido: await cargarPedido(), aprobado: false };
  }

  // Solo pasa a "pagado" si seguía pendiente (evita dobles confirmaciones).
  // El descuento de stock lo hace la base de datos (trigger) en este cambio de estado.
  const { data: actualizados } = await admin
    .from("orders")
    .update({ estado: "pagado" })
    .eq("id", pago.order_id)
    .eq("estado", "pendiente_pago")
    .select("id");

  const pedido = await cargarPedido();
  if (actualizados?.length) {
    revalidatePath("/", "layout"); // el stock cambió
    await enviarCorreosPago(admin, pedido, urlSitio);
    await enviarAlertasStock(admin, urlSitio).catch(() => {});
  } else if (pedido?.estado === "cancelado") {
    // Pago aprobado sobre un pedido cancelado: avisar al admin para revisarlo
    await enviarCorreo({
      para: correosAdmin(),
      asunto: `⚠️ Pago recibido en pedido cancelado #${pedido.numero}`,
      html: `<p>Se aprobó un pago (${clientTransactionId}) para el pedido #${pedido.numero}, que estaba cancelado. Revísalo en el panel.</p>`,
    });
  }
  return { pedido, aprobado: true };
}

/** Envía comprobante al cliente y aviso al admin (una sola vez por pedido). */
export async function enviarCorreosPago(admin, pedido, urlSitio) {
  const { data: marcado } = await admin
    .from("orders")
    .update({ correos_enviados: true })
    .eq("id", pedido.id)
    .eq("correos_enviados", false)
    .select("id");
  if (!marcado?.length) return; // ya se enviaron

  const { data: items } = await admin.from("order_items").select("*").eq("order_id", pedido.id).order("id");
  const datos = { pedido, items: items || [], urlSitio };
  const cliente = comprobanteCliente(datos);
  const aviso = avisoAdmin(datos);

  const envios = [
    enviarCorreo({ para: pedido.cliente_correo, asunto: cliente.asunto, html: cliente.html, responderA: correoAdmin() || undefined }),
  ];
  if (correosAdmin().length) {
    envios.push(enviarCorreo({ para: correosAdmin(), asunto: aviso.asunto, html: aviso.html, responderA: pedido.cliente_correo }));
  }
  const resultados = await Promise.all(envios);

  // Si el correo al cliente falló, se permite reintentar más tarde
  if (!resultados[0].ok) {
    await admin.from("orders").update({ correos_enviados: false }).eq("id", pedido.id);
  }
}

/** Aviso al cliente de que su pedido fue enviado. */
export async function enviarAvisoEnvio(pedido, urlSitio) {
  const correo = avisoEnvio({ pedido, urlSitio });
  return enviarCorreo({ para: pedido.cliente_correo, asunto: correo.asunto, html: correo.html, responderA: correoAdmin() || undefined });
}
