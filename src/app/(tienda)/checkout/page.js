"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useCarrito } from "@/context/CarritoContext";
import { obtenerClienteNavegador } from "@/lib/supabase/cliente";
import { PROVINCIAS } from "@/config/envios";
import { formatearPrecio } from "@/lib/utilidades";
import { TIENDA } from "@/config/tienda";
import { IconoWhatsApp } from "@/components/tienda/Iconos";

// Mientras no esté la pasarela, el pedido se guarda y se termina por WhatsApp
const POR_WHATSAPP = !TIENDA.pagoEnLinea;

const VACIO = {
  nombre: "",
  cedula: "",
  correo: "",
  telefono: "",
  provincia: "",
  ciudad: "",
  sector: "",
  direccion: "",
  referencia: "",
  notas: "",
};

export default function Checkout() {
  const { items, cargado, subtotal, vaciar } = useCarrito();
  const [datos, setDatos] = useState(VACIO);
  const [errores, setErrores] = useState({});
  const [tarifas, setTarifas] = useState([]);
  const [tarifaId, setTarifaId] = useState(null);
  const [usuario, setUsuario] = useState(null);
  const [guardarDireccion, setGuardarDireccion] = useState(true);
  const [acepta, setAcepta] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");

  // Tarifas de envío y, si hay sesión, la dirección guardada
  useEffect(() => {
    const supabase = obtenerClienteNavegador();
    (async () => {
      const { data: t } = await supabase
        .from("tarifas_envio")
        .select("id, metodo, provincia, es_local, nombre, descripcion, costo")
        .eq("activo", true)
        .order("orden");
      setTarifas(t || []);

      const { data: sesion } = await supabase.auth.getUser();
      if (sesion?.user) {
        setUsuario(sesion.user);
        const { data: perfil } = await supabase
          .from("perfiles_clientes")
          .select("*")
          .eq("user_id", sesion.user.id)
          .maybeSingle();
        setDatos((d) => ({
          ...d,
          correo: sesion.user.email || d.correo,
          ...(perfil
            ? {
                nombre: perfil.nombre || "",
                cedula: perfil.cedula || "",
                telefono: perfil.telefono || "",
                provincia: perfil.provincia || "",
                ciudad: perfil.ciudad || "",
                sector: perfil.sector || "",
                direccion: perfil.direccion || "",
                referencia: perfil.referencia || "",
              }
            : {}),
        }));
      }
    })();
  }, []);

  const opcionesEnvio = useMemo(
    () => tarifas.filter((t) => t.provincia === datos.provincia),
    [tarifas, datos.provincia]
  );

  // Si cambia la provincia, elige la primera opción disponible
  useEffect(() => {
    if (!opcionesEnvio.find((t) => t.id === tarifaId)) setTarifaId(opcionesEnvio[0]?.id ?? null);
  }, [opcionesEnvio, tarifaId]);

  const tarifa = opcionesEnvio.find((t) => t.id === tarifaId);
  const costoEnvio = tarifa ? Number(tarifa.costo) : 0;
  const total = subtotal + costoEnvio;

  function cambiar(campo, valor) {
    setDatos((d) => ({ ...d, [campo]: valor }));
    if (errores[campo]) setErrores((e) => ({ ...e, [campo]: undefined }));
  }

  async function pagar(e) {
    e.preventDefault();
    setError("");
    if (!tarifa) return setError("Elige una opción de envío.");
    if (!acepta) return setError("Debes aceptar la política de privacidad y las condiciones de compra.");

    setEnviando(true);
    try {
      const respuesta = await fetch("/api/pedidos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cliente: datos,
          items: items.map((i) => ({ productoId: i.productoId, talla: i.talla, cantidad: i.cantidad })),
          tarifaId: tarifa.id,
          aceptaPoliticas: acepta,
          guardarDireccion: Boolean(usuario && guardarDireccion),
        }),
      });
      const r = await respuesta.json();
      if (!respuesta.ok) {
        setErrores(r.errores || {});
        setError(r.error || "No pudimos procesar tu pedido.");
        setEnviando(false);
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      // Pedido por WhatsApp: queda guardado en el panel y se abre el chat con todo el detalle
      if (r.urlWhatsApp) {
        vaciar();
        window.location.href = r.urlWhatsApp;
        return;
      }
      // Pedido creado: ir a pagar (o a la página del pedido si la pasarela no respondió)
      window.location.href = r.urlPago || `${r.urlPedido}${r.aviso ? "&pago=error" : ""}`;
    } catch {
      setError("No hay conexión. Revisa tu internet e intenta de nuevo.");
      setEnviando(false);
    }
  }

  if (!cargado) return <div className="contenedor min-h-[50vh] pt-10" />;

  if (items.length === 0) {
    return (
      <div className="contenedor flex min-h-[50vh] flex-col items-center justify-center pt-10 text-center">
        <h1 className="titulo-seccion">Tu carrito está vacío</h1>
        <Link href="/catalogo" className="btn-ocre mt-6">Ir al catálogo</Link>
      </div>
    );
  }

  return (
    <div className="contenedor pt-8">
      <p className="etiqueta text-ocre">Finalizar compra</p>
      <h1 className="titulo-seccion mt-1">{POR_WHATSAPP ? "Datos de envío" : "Datos de envío y pago"}</h1>
      {POR_WHATSAPP && (
        <p className="mt-2 text-sm text-marino/70">
          Llena tus datos y te llevamos a WhatsApp con tu pedido listo. Ahí confirmamos el stock y coordinamos el pago.
        </p>
      )}

      {!usuario && (
        <p className="mt-3 text-sm text-marino/70">
          Compra como invitado o{" "}
          <Link href="/cuenta?volver=/checkout" className="text-ocre underline underline-offset-4">
            inicia sesión
          </Link>{" "}
          para guardar tu dirección.
        </p>
      )}

      {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <form onSubmit={pagar} className="mt-6 grid gap-8 lg:grid-cols-[1fr_380px]" noValidate>
        <div className="space-y-6">
          {/* Contacto */}
          <section className="rounded-2xl bg-white p-5">
            <h2 className="etiqueta mb-4">1 · Tus datos</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo etiqueta="Nombre y apellido *" error={errores.nombre} className="sm:col-span-2">
                <input className="campo" autoComplete="name" value={datos.nombre} onChange={(e) => cambiar("nombre", e.target.value)} />
              </Campo>
              <Campo
                etiqueta={POR_WHATSAPP ? "Correo electrónico (opcional)" : "Correo electrónico *"}
                error={errores.correo}
                ayuda={POR_WHATSAPP ? null : "Aquí te llega el comprobante de compra."}
              >
                <input className="campo" type="email" autoComplete="email" inputMode="email" value={datos.correo} onChange={(e) => cambiar("correo", e.target.value)} />
              </Campo>
              <Campo etiqueta="Teléfono / WhatsApp *" error={errores.telefono}>
                <input className="campo" type="tel" autoComplete="tel" inputMode="tel" placeholder="0991234567" value={datos.telefono} onChange={(e) => cambiar("telefono", e.target.value)} />
              </Campo>
              <Campo etiqueta="Cédula (opcional)" error={errores.cedula}>
                <input className="campo" inputMode="numeric" maxLength={13} value={datos.cedula} onChange={(e) => cambiar("cedula", e.target.value)} />
              </Campo>
            </div>
          </section>

          {/* Dirección */}
          <section className="rounded-2xl bg-white p-5">
            <h2 className="etiqueta mb-4">2 · Dirección de entrega</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo etiqueta="Provincia *" error={errores.provincia}>
                <select className="campo" value={datos.provincia} onChange={(e) => cambiar("provincia", e.target.value)}>
                  <option value="">Elige tu provincia</option>
                  {PROVINCIAS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </Campo>
              <Campo etiqueta="Ciudad *" error={errores.ciudad}>
                <input className="campo" autoComplete="address-level2" value={datos.ciudad} onChange={(e) => cambiar("ciudad", e.target.value)} />
              </Campo>
              <Campo etiqueta="Sector / barrio *" error={errores.sector} className="sm:col-span-2">
                <input className="campo" placeholder="Ej: Cumbayá, La Primavera" value={datos.sector} onChange={(e) => cambiar("sector", e.target.value)} />
              </Campo>
              <Campo etiqueta="Dirección *" error={errores.direccion} className="sm:col-span-2">
                <input className="campo" autoComplete="street-address" placeholder="Calle principal, número y calle secundaria" value={datos.direccion} onChange={(e) => cambiar("direccion", e.target.value)} />
              </Campo>
              <Campo etiqueta="Referencia" className="sm:col-span-2">
                <input className="campo" placeholder="Ej: casa blanca junto a la farmacia" value={datos.referencia} onChange={(e) => cambiar("referencia", e.target.value)} />
              </Campo>
            </div>
            {usuario && (
              <label className="mt-4 flex items-center gap-2 text-sm">
                <input type="checkbox" className="h-4 w-4 accent-ocre" checked={guardarDireccion} onChange={(e) => setGuardarDireccion(e.target.checked)} />
                Guardar esta dirección en mi cuenta
              </label>
            )}
          </section>

          {/* Envío */}
          <section className="rounded-2xl bg-white p-5">
            <h2 className="etiqueta mb-4">3 · Envío</h2>
            {!datos.provincia ? (
              <p className="text-sm text-marino/60">Elige tu provincia para ver las opciones de envío.</p>
            ) : opcionesEnvio.length === 0 ? (
              <p className="text-sm text-marino/60">Por ahora no tenemos envíos configurados para {datos.provincia}. Escríbenos por WhatsApp.</p>
            ) : (
              <div className="space-y-2">
                {opcionesEnvio.map((t) => (
                  <label
                    key={t.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${
                      tarifaId === t.id ? "border-marino bg-hueso" : "border-marino/15 hover:border-marino/40"
                    }`}
                  >
                    <input type="radio" name="envio" className="mt-1 h-4 w-4 accent-ocre" checked={tarifaId === t.id} onChange={() => setTarifaId(t.id)} />
                    <span className="flex-1">
                      <span className="flex justify-between gap-2 text-sm font-semibold">
                        {t.nombre}
                        <span>{formatearPrecio(t.costo)}</span>
                      </span>
                      {t.descripcion && <span className="mt-0.5 block text-xs text-marino/60">{t.descripcion}</span>}
                    </span>
                  </label>
                ))}
                {opcionesEnvio.some((t) => t.es_local) && (
                  <p className="pt-1 text-xs text-marino/60">
                    La zona local cubre desde Cumbayá hasta El Portal / San Luis Shopping. Si estás fuera de esa zona, elige Servientrega.
                  </p>
                )}
              </div>
            )}
            <Campo etiqueta="Nota para tu pedido (opcional)" className="mt-4">
              <textarea className="campo" rows={2} value={datos.notas} onChange={(e) => cambiar("notas", e.target.value)} />
            </Campo>
          </section>
        </div>

        {/* Resumen */}
        <aside className="h-fit rounded-2xl bg-white p-5 lg:sticky lg:top-24">
          <h2 className="font-serif text-2xl">Tu pedido</h2>
          <ul className="mt-4 divide-y divide-marino/10">
            {items.map((i) => (
              <li key={i.clave} className="flex gap-3 py-3">
                <div className="aspect-[3/4] w-12 shrink-0 overflow-hidden rounded-md bg-hueso-oscuro">
                  {i.imagen && <img src={i.imagen} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="flex-1 text-sm">
                  <p className="leading-snug">{i.nombre}</p>
                  <p className="text-xs text-marino/60">Talla {i.talla} · {i.cantidad} u.</p>
                </div>
                <span className="text-sm font-semibold">{formatearPrecio(i.precio * i.cantidad)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 space-y-1.5 border-t border-marino/10 pt-3 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span>{formatearPrecio(subtotal)}</span></div>
            <div className="flex justify-between"><span>Envío</span><span>{tarifa ? formatearPrecio(costoEnvio) : "—"}</span></div>
            <div className="flex justify-between border-t border-marino/10 pt-2 text-base font-semibold"><span>Total</span><span>{formatearPrecio(total)}</span></div>
          </div>

          <label className="mt-5 flex items-start gap-2 text-xs leading-relaxed text-marino/80">
            <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-ocre" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} />
            <span>
              Acepto la{" "}
              <Link href="/politicas/privacidad" target="_blank" className="underline">política de privacidad</Link>, la{" "}
              <Link href="/politicas/envios" target="_blank" className="underline">política de envíos</Link> y la de{" "}
              <Link href="/politicas/cambios-y-devoluciones" target="_blank" className="underline">cambios y devoluciones</Link>.
            </span>
          </label>

          {POR_WHATSAPP ? (
            <>
              <button type="submit" disabled={enviando || !tarifa} className="btn-ocre mt-5 w-full py-4">
                <IconoWhatsApp className="h-5 w-5" />
                {enviando ? "Abriendo WhatsApp..." : `Enviar pedido por WhatsApp · ${formatearPrecio(total)}`}
              </button>
              <p className="mt-3 text-center text-[11px] text-marino/50">
                Tu pedido queda registrado y se abre WhatsApp con el detalle. Pagas por transferencia, efectivo o tarjeta, como prefieras.
              </p>
            </>
          ) : (
            <>
              <button type="submit" disabled={enviando || !tarifa} className="btn-ocre mt-5 w-full py-4">
                {enviando ? "Procesando..." : `Pagar ${formatearPrecio(total)}`}
              </button>
              <p className="mt-3 text-center text-[11px] text-marino/50">
                Pago seguro con tarjeta de crédito o débito a través de PayPhone. Los valores finales se confirman al procesar tu pedido.
              </p>
            </>
          )}
        </aside>
      </form>
    </div>
  );
}

function Campo({ etiqueta, error, ayuda, className = "", children }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-sm font-medium">{etiqueta}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-red-700">{error}</span>
      ) : (
        ayuda && <span className="mt-1 block text-xs text-marino/50">{ayuda}</span>
      )}
    </label>
  );
}
