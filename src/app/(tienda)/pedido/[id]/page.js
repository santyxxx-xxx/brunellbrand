import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerClienteAdmin } from "@/lib/supabase/admin";
import { obtenerClienteServidor } from "@/lib/supabase/servidor";
import { ESTADOS_PEDIDO } from "@/config/envios";
import { TIENDA } from "@/config/tienda";
import { enlaceWhatsApp, formatearPrecio, mensajePedidoWhatsApp } from "@/lib/utilidades";
import { LimpiarCarrito, ReintentarPago } from "@/components/pedido/AccionesPedido";
import { IconoWhatsApp } from "@/components/tienda/Iconos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mi pedido", robots: { index: false } };

const PASOS = ["pendiente_pago", "pagado", "enviado", "entregado"];

export default async function PaginaPedido({ params, searchParams }) {
  const { id } = await params;
  const { t: token, pago } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const admin = obtenerClienteAdmin();
  const { data: pedido } = await admin.from("orders").select("*").eq("id", id).maybeSingle();
  if (!pedido) notFound();

  // Acceso: enlace con token (invitado) o dueño con sesión iniciada
  let autorizado = token && String(token) === String(pedido.token_acceso);
  if (!autorizado && pedido.user_id) {
    const sesion = await obtenerClienteServidor();
    const { data } = await sesion.auth.getUser();
    autorizado = data?.user?.id === pedido.user_id;
  }
  if (!autorizado) notFound();

  const { data: items } = await admin.from("order_items").select("*").eq("order_id", id).order("id");
  const estado = ESTADOS_PEDIDO[pedido.estado];
  const pagado = ["pagado", "enviado", "entregado"].includes(pedido.estado);
  const pasoActual = PASOS.indexOf(pedido.estado);

  const ayuda = enlaceWhatsApp(
    TIENDA.whatsapp[0]?.numero,
    `¡Hola Brunel Brand! Tengo una consulta sobre mi pedido #${pedido.numero}.`
  );

  return (
    <div className="contenedor max-w-3xl pt-10">
      {pagado && pago === "ok" && <LimpiarCarrito />}

      {/* Mensaje principal */}
      {pagado && pago === "ok" ? (
        <div className="rounded-2xl bg-marino p-6 text-center text-hueso sm:p-10">
          <div className="grifo-brillo grifo-entrada mx-auto h-20 w-[72px]" />
          <h1 className="mt-4 font-serif text-3xl sm:text-4xl">¡Gracias por tu compra!</h1>
          <p className="mt-2 text-sm text-hueso/75">
            Tu pago fue confirmado. Te enviamos el comprobante de compra a <strong>{pedido.cliente_correo}</strong>.
          </p>
        </div>
      ) : pedido.estado === "pendiente_pago" && !TIENDA.pagoEnLinea ? (
        <div className="rounded-2xl bg-white p-6 sm:p-8">
          <h1 className="font-serif text-3xl">Recibimos tu pedido</h1>
          <p className="mt-2 text-sm text-marino/70">
            Envíanos el pedido por WhatsApp para confirmar el stock y coordinar el pago y la entrega.
          </p>
          <a
            href={enlaceWhatsApp(TIENDA.whatsapp[0]?.numero, mensajePedidoWhatsApp(pedido, items || []))}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ocre mt-5 w-full py-4 sm:w-auto"
          >
            <IconoWhatsApp className="h-5 w-5" /> Enviar pedido por WhatsApp
          </a>
        </div>
      ) : pedido.estado === "pendiente_pago" ? (
        <div className="rounded-2xl bg-white p-6 sm:p-8">
          <h1 className="font-serif text-3xl">
            {pago === "fallido" || pago === "cancelado" ? "El pago no se completó" : "Tu pedido está pendiente de pago"}
          </h1>
          <p className="mt-2 text-sm text-marino/70">
            {pago === "error"
              ? "La pasarela de pagos no respondió, pero tu pedido quedó guardado. Puedes intentar pagar de nuevo."
              : "Tu pedido está guardado. Puedes completar el pago cuando quieras; el stock se reserva solo al confirmarse el pago."}
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <ReintentarPago pedidoId={pedido.id} token={pedido.token_acceso} texto={`Pagar ${formatearPrecio(pedido.total)}`} />
            <a href={ayuda} target="_blank" rel="noopener noreferrer" className="btn-borde py-4">
              <IconoWhatsApp className="h-5 w-5" /> Necesito ayuda
            </a>
          </div>
        </div>
      ) : (
        <h1 className="titulo-seccion">Mi pedido</h1>
      )}

      {/* Estado y seguimiento */}
      <section className="mt-6 rounded-2xl bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-serif text-2xl">Pedido #{pedido.numero}</p>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${estado.color}`}>{estado.texto}</span>
        </div>

        {pedido.estado !== "cancelado" && (
          <ol className="mt-6 grid grid-cols-4 gap-1 text-center text-[11px]">
            {PASOS.map((p, i) => (
              <li key={p}>
                <span className={`mx-auto block h-1.5 rounded-full ${i <= pasoActual ? "bg-ocre" : "bg-marino/10"}`} />
                <span className={`mt-2 block ${i <= pasoActual ? "font-semibold" : "text-marino/50"}`}>
                  {ESTADOS_PEDIDO[p].texto}
                </span>
              </li>
            ))}
          </ol>
        )}

        {pedido.numero_guia && (
          <div className="mt-6 rounded-xl bg-hueso p-4 text-center">
            <p className="etiqueta text-marino/60">Guía Servientrega</p>
            <p className="mt-1 text-xl font-semibold tracking-wider">{pedido.numero_guia}</p>
            <a href="https://www.servientrega.com.ec/rastreo" target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-ocre underline">
              Rastrear envío
            </a>
          </div>
        )}
      </section>

      {/* Productos */}
      <section className="mt-6 rounded-2xl bg-white p-6">
        <h2 className="etiqueta mb-2">Productos</h2>
        <ul className="divide-y divide-marino/10">
          {(items || []).map((i) => (
            <li key={i.id} className="flex gap-3 py-3">
              <div className="aspect-[3/4] w-12 shrink-0 overflow-hidden rounded-md bg-hueso-oscuro">
                {i.imagen && <img src={i.imagen} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="flex-1 text-sm">
                <p>{i.nombre}</p>
                <p className="text-xs text-marino/60">Talla {i.talla} · {i.cantidad} × {formatearPrecio(i.precio_unitario)}</p>
              </div>
              <span className="text-sm font-semibold">{formatearPrecio(i.subtotal)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-2 space-y-1.5 border-t border-marino/10 pt-3 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>{formatearPrecio(pedido.subtotal)}</span></div>
          <div className="flex justify-between"><span>Envío · {pedido.envio_nombre}</span><span>{formatearPrecio(pedido.costo_envio)}</span></div>
          <div className="flex justify-between pt-1 text-base font-semibold"><span>Total</span><span>{formatearPrecio(pedido.total)}</span></div>
        </div>
      </section>

      {/* Entrega */}
      <section className="mt-6 rounded-2xl bg-white p-6 text-sm">
        <h2 className="etiqueta mb-2">Entrega</h2>
        <p className="font-semibold">{pedido.cliente_nombre}</p>
        <p className="text-marino/80">{pedido.cliente_telefono} · {pedido.cliente_correo}</p>
        <p className="mt-2 text-marino/80">{pedido.direccion}, {pedido.sector}</p>
        <p className="text-marino/80">{pedido.ciudad}, {pedido.provincia}</p>
        {pedido.referencia && <p className="text-marino/60">Ref.: {pedido.referencia}</p>}
      </section>

      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/catalogo" className="btn-borde">Seguir comprando</Link>
        {pagado && (
          <a href={ayuda} target="_blank" rel="noopener noreferrer" className="btn-borde">
            <IconoWhatsApp className="h-5 w-5" /> Consultar por WhatsApp
          </a>
        )}
      </div>
    </div>
  );
}
