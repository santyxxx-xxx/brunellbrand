"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { obtenerClienteNavegador } from "@/lib/supabase/cliente";
import { ESTADOS_PEDIDO } from "@/config/envios";
import { enlaceWhatsApp, formatearPrecio } from "@/lib/utilidades";

export default function DetallePedido() {
  const { id } = useParams();
  const [pedido, setPedido] = useState(undefined); // undefined = cargando, null = no existe
  const [items, setItems] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [form, setForm] = useState({ estado: "", numeroGuia: "", notasInternas: "", notificarCliente: true });
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  async function cargar() {
    const supabase = obtenerClienteNavegador();
    const [{ data: p }, { data: it }, { data: pg }] = await Promise.all([
      supabase.from("orders").select("*").eq("id", id).maybeSingle(),
      supabase
        .from("order_items")
        .select("id, producto_id, sku, nombre, talla, imagen, precio_unitario, cantidad, subtotal")
        .eq("order_id", id)
        .order("id"),
      supabase.from("order_payments").select("*").eq("order_id", id).order("creado_en", { ascending: false }),
    ]);
    setPedido(p || null);
    setItems(it || []);
    setPagos(pg || []);
    if (p) setForm((f) => ({ ...f, estado: p.estado, numeroGuia: p.numero_guia || "", notasInternas: p.notas_internas || "" }));
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function enviar(cuerpo) {
    setGuardando(true);
    setMensaje(null);
    try {
      const respuesta = await fetch(`/api/admin/pedidos/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
      });
      const r = await respuesta.json();
      setMensaje({ ok: respuesta.ok, texto: r.mensaje || r.error });
      if (respuesta.ok) await cargar();
    } catch {
      setMensaje({ ok: false, texto: "No hay conexión." });
    }
    setGuardando(false);
  }

  function guardar(e) {
    e.preventDefault();
    if (form.estado === "cancelado" && pedido.estado !== "cancelado") {
      if (!confirm("¿Cancelar este pedido? Si ya estaba pagado, el stock se devuelve. El reembolso del dinero se hace aparte en PayPhone.")) return;
    }
    if (form.estado === "pagado" && pedido.estado === "pendiente_pago") {
      if (!confirm("¿Marcar como pagado manualmente? Se descontará el stock y se enviará el comprobante al cliente.")) return;
    }
    enviar({ accion: "actualizar", ...form });
  }

  if (pedido === undefined) return <p className="text-sm text-marino/60">Cargando pedido...</p>;
  if (!pedido) return <p className="text-sm">Pedido no encontrado.</p>;

  const whatsapp = enlaceWhatsApp(
    pedido.cliente_telefono.replace(/^0/, "593"),
    `Hola ${pedido.cliente_nombre.split(" ")[0]}, te escribimos de Brunel Brand sobre tu pedido #${pedido.numero}.`
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/pedidos" className="text-sm underline underline-offset-4">← Pedidos</Link>
          <h1 className="mt-2 flex items-center gap-3 font-serif text-3xl">
            Pedido #{pedido.numero}
            <span className={`rounded-full px-3 py-1 font-sans text-xs font-semibold ${ESTADOS_PEDIDO[pedido.estado]?.color}`}>
              {ESTADOS_PEDIDO[pedido.estado]?.texto}
            </span>
          </h1>
          <p className="mt-1 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-marino/10 px-2.5 py-0.5">{pedido.canal === "tienda" ? "Venta en tienda" : "Venta web"}</span>
            {pedido.vendedor_nombre && <span className="rounded-full bg-ocre/15 px-2.5 py-0.5">Vendedor: {pedido.vendedor_nombre}</span>}
            {pedido.metodo_pago && <span className="rounded-full bg-marino/10 px-2.5 py-0.5 capitalize">{pedido.metodo_pago}</span>}
            {pedido.canal === "tienda" && pedido.envio_nombre && pedido.envio_nombre !== "Venta en tienda" && (
              <span className="rounded-full bg-marino/10 px-2.5 py-0.5">{pedido.envio_nombre}</span>
            )}
          </p>
          <p className="text-sm text-marino/60">
            Creado {new Date(pedido.creado_en).toLocaleString("es-EC")}
            {pedido.pagado_en && ` · Pagado ${new Date(pedido.pagado_en).toLocaleString("es-EC")}`}
          </p>
        </div>
      </div>

      {pedido.stock_insuficiente && (
        <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          Al confirmarse el pago no había stock suficiente de algún producto. Revisa tu inventario y contacta al cliente.
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <section className="rounded-xl bg-white p-5">
            <h2 className="etiqueta mb-3">Productos</h2>
            <ul className="divide-y divide-marino/10">
              {items.map((i) => (
                <li key={i.id} className="flex gap-3 py-3 text-sm">
                  <div className="aspect-[3/4] w-12 shrink-0 overflow-hidden rounded bg-hueso-oscuro">
                    {i.imagen && <img src={i.imagen} alt="" className="h-full w-full object-cover" />}
                  </div>
                  <div className="flex-1">
                    <p>{i.nombre}</p>
                    <p className="text-xs text-marino/60">{i.sku} · Talla {i.talla} · {i.cantidad} × {formatearPrecio(i.precio_unitario)}</p>
                  </div>
                  <span className="font-semibold">{formatearPrecio(i.subtotal)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 space-y-1 border-t border-marino/10 pt-3 text-sm">
              <div className="flex justify-between"><span>Subtotal</span><span>{formatearPrecio(pedido.subtotal)}</span></div>
              <div className="flex justify-between"><span>Envío · {pedido.envio_nombre}</span><span>{formatearPrecio(pedido.costo_envio)}</span></div>
              <div className="flex justify-between text-base font-semibold"><span>Total</span><span>{formatearPrecio(pedido.total)}</span></div>
            </div>
          </section>

          <section className="rounded-xl bg-white p-5 text-sm">
            <h2 className="etiqueta mb-3">Cliente y entrega</h2>
            <p className="font-semibold">{pedido.cliente_nombre}</p>
            {pedido.cliente_cedula && <p>C.I. {pedido.cliente_cedula}</p>}
            <p>
              <a href={`mailto:${pedido.cliente_correo}`} className="underline">{pedido.cliente_correo}</a> ·{" "}
              <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="underline">{pedido.cliente_telefono}</a>
            </p>
            <div className="mt-3 rounded-lg bg-hueso p-3">
              <p>{pedido.direccion}</p>
              <p>{pedido.sector} · {pedido.ciudad}, {pedido.provincia}</p>
              {pedido.referencia && <p className="text-marino/70">Ref.: {pedido.referencia}</p>}
              <p className="mt-1 font-semibold">{pedido.envio_nombre}</p>
            </div>
            {pedido.notas_cliente && <p className="mt-3"><strong>Nota del cliente:</strong> {pedido.notas_cliente}</p>}
            {!pedido.user_id && <p className="mt-2 text-xs text-marino/50">Compra como invitado</p>}
          </section>

          <section className="rounded-xl bg-white p-5 text-sm">
            <h2 className="etiqueta mb-3">Intentos de pago</h2>
            {pagos.length === 0 ? (
              <p className="text-marino/60">Sin intentos de pago.</p>
            ) : (
              <ul className="space-y-2">
                {pagos.map((p) => (
                  <li key={p.id} className="rounded-lg border border-marino/10 p-3 text-xs">
                    <span className="font-semibold uppercase">{p.estado}</span> · {p.pasarela} · {p.client_transaction_id}
                    {p.transaccion_id && ` · Transacción ${p.transaccion_id}`}
                    {p.detalle?.authorizationCode && ` · Autorización ${p.detalle.authorizationCode}`}
                    {p.detalle?.cardBrand && ` · ${p.detalle.cardBrand} ${p.detalle.lastDigits || ""}`}
                    <span className="block text-marino/50">{new Date(p.creado_en).toLocaleString("es-EC")}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <form onSubmit={guardar} className="h-fit space-y-4 rounded-xl bg-white p-5 lg:sticky lg:top-28">
          <h2 className="etiqueta">Gestionar pedido</h2>
          {(pedido.estado === "por_cobrar" || (pedido.estado === "pendiente_pago" && pedido.canal === "web")) && (
            <div className="rounded-lg bg-orange-50 p-3">
              <p className="text-sm font-semibold text-orange-900">
                {pedido.estado === "pendiente_pago" ? "Pedido por WhatsApp · " : ""}Falta cobrar {formatearPrecio(pedido.total)}
              </p>
              <p className="mb-2 text-xs text-orange-900/70">¿Cómo pagó?</p>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  ["efectivo", "Efectivo"],
                  ["transferencia", "Transferencia"],
                  ["tarjeta", "Tarjeta"],
                ].map(([valor, texto]) => (
                  <button
                    key={valor}
                    type="button"
                    disabled={guardando}
                    onClick={() =>
                      enviar({
                        accion: "actualizar",
                        // Web, a domicilio o Servientrega: queda "Pagado" para enviarlo; entrega personal: "Entregado"
                        estado: pedido.canal === "web" || (pedido.entrega && pedido.entrega !== "personal") ? "pagado" : "entregado",
                        metodoPago: valor,
                      })
                    }
                    className="rounded-lg bg-marino px-2 py-2 text-[11px] font-semibold text-white"
                  >
                    {texto}
                  </button>
                ))}
              </div>
            </div>
          )}
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Estado</span>
            <select className="campo" value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })}>
              {Object.entries(ESTADOS_PEDIDO).map(([clave, e]) => (
                <option key={clave} value={clave}>{e.texto}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Número de guía (Servientrega)</span>
            <input className="campo" value={form.numeroGuia} onChange={(e) => setForm({ ...form, numeroGuia: e.target.value })} placeholder="Ej: 1234567890" />
          </label>
          {form.estado === "enviado" && pedido.estado !== "enviado" && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-ocre" checked={form.notificarCliente} onChange={(e) => setForm({ ...form, notificarCliente: e.target.checked })} />
              Avisar al cliente por correo
            </label>
          )}
          <label className="block text-sm">
            <span className="mb-1 block font-medium">Notas internas</span>
            <textarea className="campo" rows={3} value={form.notasInternas} onChange={(e) => setForm({ ...form, notasInternas: e.target.value })} placeholder="Solo las ves tú" />
          </label>
          <button type="submit" disabled={guardando} className="btn-ocre w-full">{guardando ? "Guardando..." : "Guardar cambios"}</button>
          {["pagado", "enviado", "entregado"].includes(pedido.estado) && (
            <button type="button" disabled={guardando} onClick={() => enviar({ accion: "reenviarComprobante" })} className="btn-borde w-full">
              Reenviar comprobante
            </button>
          )}
          {mensaje && (
            <p className={`rounded-lg p-3 text-sm ${mensaje.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>{mensaje.texto}</p>
          )}
        </form>
      </div>
    </div>
  );
}
