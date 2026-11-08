"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useCarrito } from "@/context/CarritoContext";
import { TIENDA } from "@/config/tienda";
import { enlaceWhatsApp, formatearPrecio, nombreConOpcion, nombreWeb, ordenarTallas, stockTotal } from "@/lib/utilidades";
import GuiaTallas from "./GuiaTallas";
import { IconoWhatsApp } from "./Iconos";

// Une las versiones de una misma opción: por cada talla usa la que tenga más stock
function tallasDeOpcion(candidatos) {
  const mejor = {};
  for (const v of candidatos) {
    for (const t of ordenarTallas(v.tallas || [])) {
      if (!mejor[t.talla] || t.stock > mejor[t.talla].stock) mejor[t.talla] = { talla: t.talla, stock: t.stock, producto: v };
    }
  }
  return ordenarTallas(Object.values(mejor));
}

export default function DetalleProducto({ producto: inicial }) {
  const variantes = inicial.variantes?.length ? inicial.variantes : [inicial];
  const opciones = [...new Set(variantes.map((v) => v.opcion).filter(Boolean))].sort();
  const opcionInicial =
    inicial.opcion && stockTotal(inicial.tallas) > 0
      ? inicial.opcion
      : opciones.find((o) => variantes.some((v) => v.opcion === o && stockTotal(v.tallas) > 0)) || inicial.opcion || opciones[0] || null;

  const [opcion, setOpcion] = useState(opcionInicial);
  const candidatos = opciones.length ? variantes.filter((v) => v.opcion === opcion) : variantes;
  const tallas = tallasDeOpcion(candidatos.length ? candidatos : [inicial]);
  const primeraDisponible = tallas.find((t) => t.stock > 0)?.talla || null;

  const [fotoActiva, setFotoActiva] = useState(0);
  const [talla, setTalla] = useState(primeraDisponible);
  const [cantidad, setCantidad] = useState(1);
  const [agregado, setAgregado] = useState(false);
  const [urlPagina, setUrlPagina] = useState("");
  useEffect(() => setUrlPagina(window.location.href), []);
  const { agregar } = useCarrito();

  const tallaSeleccionada = tallas.find((t) => t.talla === talla);
  const stockDisponible = tallaSeleccionada?.stock || 0;
  // La prenda exacta que se vende: la versión con stock en esa talla
  const producto =
    tallaSeleccionada?.producto ||
    candidatos.find((v) => stockTotal(v.tallas) > 0) ||
    candidatos[0] ||
    inicial;
  const fotos = (candidatos.find((v) => v.imagenes?.length) || variantes.find((v) => v.imagenes?.length) || producto).imagenes;
  const imagenes = fotos?.length ? fotos : [null];

  function elegirOpcion(nueva) {
    setOpcion(nueva);
    const lista = tallasDeOpcion(variantes.filter((v) => v.opcion === nueva));
    const sigue = lista.find((t) => t.talla === talla && t.stock > 0);
    setTalla(sigue ? talla : lista.find((t) => t.stock > 0)?.talla || null);
    setCantidad(1);
    setFotoActiva(0);
  }
  const agotado = !primeraDisponible;
  const enOferta = producto.precio_anterior && Number(producto.precio_anterior) > Number(producto.precio);

  function agregarAlCarrito() {
    if (!talla || stockDisponible === 0) return;
    agregar({
      productoId: producto.id,
      slug: producto.slug,
      nombre: nombreConOpcion(producto),
      precio: Number(producto.precio),
      imagen: imagenes[0] || null,
      talla,
      cantidad,
      stock: stockDisponible,
    });
    setAgregado(true);
    setTimeout(() => setAgregado(false), 2500);
  }

  const mensajeWhatsApp = [
    `¡Hola Brunel Brand! Me interesa este producto:`,
    ``,
    `• ${nombreConOpcion(producto)} (código ${producto.sku})`,
    talla ? `• Talla: ${talla}` : null,
    `• Cantidad: ${cantidad}`,
    `• Precio: ${formatearPrecio(producto.precio)}`,
    ``,
    urlPagina,
  ]
    .filter((linea) => linea !== null)
    .join("\n");

  return (
    <div className="grid gap-8 md:grid-cols-2 md:gap-12">
      {/* Galería */}
      <div>
        <div className="aspect-[3/4] overflow-hidden rounded-2xl bg-hueso-oscuro">
          {imagenes[fotoActiva] ? (
            <img src={imagenes[fotoActiva]} alt={nombreWeb(producto)} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center">
            <img src="/marca/grifo-negro.webp" alt="" className="h-32 w-auto opacity-15" />
          </div>
          )}
        </div>
        {imagenes.length > 1 && (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {imagenes.map((src, i) => (
              <button
                key={src}
                type="button"
                onClick={() => setFotoActiva(i)}
                className={`aspect-[3/4] w-16 shrink-0 overflow-hidden rounded-lg border-2 transition sm:w-20 ${
                  i === fotoActiva ? "border-ocre" : "border-transparent opacity-70"
                }`}
                aria-label={`Ver foto ${i + 1}`}
              >
                <img src={src} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Información */}
      <div className="md:py-4">
        {producto.categoria && (
          <Link href={`/catalogo?categoria=${producto.categoria.slug}`} className="etiqueta text-ocre">
            {producto.categoria.nombre}
          </Link>
        )}
        <h1 className="mt-2 font-serif text-3xl font-medium leading-tight sm:text-4xl">{nombreWeb(producto)}</h1>

        <div className="mt-4 flex items-baseline gap-3">
          <span className="text-2xl font-semibold">{formatearPrecio(producto.precio)}</span>
          {enOferta && (
            <span className="text-marino/50 line-through">{formatearPrecio(producto.precio_anterior)}</span>
          )}
        </div>

        {/* Corte: Oxford / Casual */}
        {opciones.length > 1 && (
          <div className="mt-8">
            <p className="etiqueta">Estilo {opcion && <span className="text-ocre">· {opcion}</span>}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {opciones.map((o) => {
                const hay = variantes.some((v) => v.opcion === o && stockTotal(v.tallas) > 0);
                return (
                  <button
                    key={o}
                    type="button"
                    onClick={() => elegirOpcion(o)}
                    className={`h-12 rounded-lg border px-5 text-sm font-semibold transition ${
                      opcion === o ? "border-marino bg-marino text-white" : "border-marino/25 bg-white hover:border-marino"
                    } ${hay ? "" : "opacity-40"}`}
                  >
                    {o}
                    {!hay && <span className="ml-1 text-[10px] font-normal">(agotada)</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}
        {opciones.length === 1 && <p className="mt-3 text-sm text-marino/70">Estilo: {opciones[0]}</p>}

        {/* Tallas */}
        <div className="mt-8">
          <div className="flex items-center justify-between">
            <p className="etiqueta">Talla {talla && <span className="text-ocre">· {talla}</span>}</p>
            <GuiaTallas />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {tallas.length === 0 && <p className="text-sm text-marino/60">Sin tallas registradas.</p>}
            {tallas.map((t) => {
              const sinStock = t.stock <= 0;
              return (
                <button
                  key={t.talla}
                  type="button"
                  disabled={sinStock}
                  onClick={() => {
                    setTalla(t.talla);
                    setCantidad(1);
                  }}
                  className={`h-12 min-w-12 rounded-lg border px-4 text-sm font-semibold transition ${
                    talla === t.talla
                      ? "border-marino bg-marino text-white"
                      : "border-marino/25 bg-white hover:border-marino"
                  } ${sinStock ? "cursor-not-allowed line-through opacity-35" : ""}`}
                >
                  {t.talla}
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-sm">
            {agotado ? (
              <span className="font-semibold text-marino/70">Producto agotado</span>
            ) : stockDisponible > 0 && stockDisponible <= 3 ? (
              <span className="font-semibold text-ocre-oscuro">¡Últimas {stockDisponible} unidades en talla {talla}!</span>
            ) : (
              <span className="text-marino/70">Disponible: {stockDisponible} unidades</span>
            )}
          </p>
        </div>

        {/* Cantidad */}
        {!agotado && (
          <div className="mt-6 flex items-center gap-4">
            <p className="etiqueta">Cantidad</p>
            <div className="flex items-center rounded-full border border-marino/25 bg-white">
              <button
                type="button"
                className="h-10 w-10 text-lg"
                onClick={() => setCantidad((c) => Math.max(1, c - 1))}
                aria-label="Restar"
              >
                −
              </button>
              <span className="w-8 text-center text-sm font-semibold">{cantidad}</span>
              <button
                type="button"
                className="h-10 w-10 text-lg"
                onClick={() => setCantidad((c) => Math.min(stockDisponible || 1, c + 1))}
                aria-label="Sumar"
              >
                +
              </button>
            </div>
          </div>
        )}

        {/* Acciones */}
        <div className="mt-8 flex flex-col gap-3">
          <button type="button" className="btn-marino w-full py-4" disabled={agotado || !talla} onClick={agregarAlCarrito}>
            {agregado ? "¡Agregado al carrito!" : "Agregar al carrito"}
          </button>
          <a
            href={enlaceWhatsApp(TIENDA.whatsapp[0]?.numero, mensajeWhatsApp)}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-ocre w-full py-4"
          >
            <IconoWhatsApp className="h-5 w-5" /> Pedir por WhatsApp
          </a>
          {agregado && (
            <Link href="/carrito" className="text-center text-sm underline underline-offset-4">
              Ver mi carrito
            </Link>
          )}
        </div>

        {producto.descripcion && (
          <div className="mt-10 border-t border-marino/10 pt-6">
            <p className="etiqueta mb-3">Descripción</p>
            <p className="whitespace-pre-line text-sm leading-relaxed text-marino/80">{producto.descripcion}</p>
          </div>
        )}

        <p className="mt-6 text-xs text-marino/50">Código: {producto.sku}</p>
      </div>
    </div>
  );
}
