"use client";

import Link from "next/link";
import { useCarrito } from "@/context/CarritoContext";
import { TIENDA } from "@/config/tienda";
import { enlaceWhatsApp, formatearPrecio } from "@/lib/utilidades";
import { IconoCerrar, IconoWhatsApp } from "@/components/tienda/Iconos";

export default function PaginaCarrito() {
  const { items, cargado, cambiarCantidad, quitar, vaciar, subtotal } = useCarrito();

  if (!cargado) {
    return <div className="contenedor min-h-[50vh] pt-10" />;
  }

  if (items.length === 0) {
    return (
      <div className="contenedor flex min-h-[50vh] flex-col items-center justify-center pt-10 text-center">
        <h1 className="titulo-seccion">Tu carrito está vacío</h1>
        <p className="mt-2 text-sm text-marino/60">Descubre nuestras camisas y polos.</p>
        <Link href="/catalogo" className="btn-ocre mt-6">
          Ir al catálogo
        </Link>
      </div>
    );
  }

  const mensaje = [
    "¡Hola Brunel Brand! Quisiera hacer este pedido:",
    "",
    ...items.map(
      (i) => `• ${i.cantidad} x ${i.nombre} — Talla ${i.talla} — ${formatearPrecio(i.precio * i.cantidad)}`
    ),
    "",
    `Total: ${formatearPrecio(subtotal)}`,
  ]
    .filter((l) => l !== null)
    .join("\n");

  return (
    <div className="contenedor pt-10">
      <h1 className="titulo-seccion">Mi carrito</h1>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_380px]">
        {/* Productos */}
        <ul className="divide-y divide-marino/10 border-y border-marino/10">
          {items.map((i) => (
            <li key={i.clave} className="flex gap-4 py-5">
              <Link href={`/producto/${i.slug}`} className="aspect-[3/4] w-20 shrink-0 overflow-hidden rounded-lg bg-hueso-oscuro sm:w-24">
                {i.imagen && <img src={i.imagen} alt={i.nombre} className="h-full w-full object-cover" />}
              </Link>
              <div className="flex flex-1 flex-col">
                <div className="flex justify-between gap-2">
                  <div>
                    <Link href={`/producto/${i.slug}`} className="text-sm font-medium leading-snug hover:text-ocre">
                      {i.nombre}
                    </Link>
                    <p className="mt-1 text-xs text-marino/60">Talla {i.talla}</p>
                  </div>
                  <button type="button" onClick={() => quitar(i.clave)} aria-label="Quitar producto" className="h-8 w-8 shrink-0 text-marino/50 hover:text-marino">
                    <IconoCerrar className="h-5 w-5" />
                  </button>
                </div>
                <div className="mt-auto flex items-center justify-between pt-3">
                  <div className="flex items-center rounded-full border border-marino/25 bg-white">
                    <button type="button" className="h-9 w-9" onClick={() => cambiarCantidad(i.clave, i.cantidad - 1)} aria-label="Restar">
                      −
                    </button>
                    <span className="w-7 text-center text-sm font-semibold">{i.cantidad}</span>
                    <button type="button" className="h-9 w-9" onClick={() => cambiarCantidad(i.clave, i.cantidad + 1)} aria-label="Sumar">
                      +
                    </button>
                  </div>
                  <span className="font-semibold">{formatearPrecio(i.precio * i.cantidad)}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>

        {/* Resumen */}
        <aside className="h-fit rounded-2xl bg-white p-6 lg:sticky lg:top-24">
          <h2 className="font-serif text-2xl">Resumen</h2>
          <div className="mt-4 flex justify-between text-sm">
            <span>Subtotal</span>
            <span className="font-semibold">{formatearPrecio(subtotal)}</span>
          </div>
          <p className="mt-1 text-xs text-marino/60">El envío se calcula en el siguiente paso según tu provincia.</p>

          {TIENDA.pagoEnLinea ? (
            <>
              <Link href="/checkout" className="btn-ocre mt-6 w-full py-4">
                Continuar al pago
              </Link>
              <p className="mt-2 text-center text-[11px] text-marino/50">Pago seguro con tarjeta vía PayPhone</p>
              <a href={enlaceWhatsApp(TIENDA.whatsapp[0]?.numero, mensaje)} target="_blank" rel="noopener noreferrer" className="btn-borde mt-4 w-full">
                <IconoWhatsApp className="h-5 w-5" /> Prefiero pedir por WhatsApp
              </a>
            </>
          ) : (
            <>
              <Link href="/checkout" className="btn-ocre mt-6 w-full py-4">
                <IconoWhatsApp className="h-5 w-5" /> Finalizar pedido por WhatsApp
              </Link>
              <p className="mt-2 text-center text-[11px] text-marino/50">
                Pones tus datos de envío y te llevamos a WhatsApp con el pedido listo.
              </p>
              <a href={enlaceWhatsApp(TIENDA.whatsapp[0]?.numero, mensaje)} target="_blank" rel="noopener noreferrer" className="mt-4 block text-center text-xs text-marino/70 underline underline-offset-4">
                O escríbenos directo con lo que llevas en el carrito
              </a>
            </>
          )}
          <button type="button" onClick={vaciar} className="mt-3 w-full text-center text-xs text-marino/60 underline underline-offset-4">
            Vaciar carrito
          </button>
        </aside>
      </div>
    </div>
  );
}
