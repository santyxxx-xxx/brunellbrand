"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { obtenerClienteNavegador } from "@/lib/supabase/cliente";
import { refrescarTienda } from "@/lib/admin";
import { lanzarConfeti } from "@/lib/confeti";
import { aNumero, formatearPrecio, ordenarTallas, stockTotal } from "@/lib/utilidades";

const METODOS = [
  { valor: "efectivo", texto: "Efectivo", icono: "💵" },
  { valor: "transferencia", texto: "Transferencia", icono: "🏦" },
  { valor: "tarjeta", texto: "Tarjeta", icono: "💳" },
];

// Venta en tienda: buscar → talla y cantidad → cobrar. Pensado para el celular.
export default function NuevaVenta() {
  const [productos, setProductos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [elegido, setElegido] = useState(null); // producto en la hoja de "agregar"
  const [lineas, setLineas] = useState([]);
  const [cobrando, setCobrando] = useState(false);
  const [metodo, setMetodo] = useState("efectivo");
  const [cliente, setCliente] = useState({ nombre: "", telefono: "" });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [exito, setExito] = useState(null);
  const buscador = useRef(null);

  async function cargar() {
    const { data } = await obtenerClienteNavegador()
      .from("productos")
      .select("id, sku, nombre, precio, imagenes, activo, tallas:producto_tallas(talla, stock)")
      .order("nombre");
    setProductos(data || []);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
  }, []);

  const resultados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const lista = q
      ? productos.filter((p) => p.nombre.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
      : productos.filter((p) => stockTotal(p.tallas) > 0);
    return lista.slice(0, 40);
  }, [productos, busqueda]);

  const total = lineas.reduce((s, l) => s + l.precio * l.cantidad, 0);
  const prendas = lineas.reduce((s, l) => s + l.cantidad, 0);

  function agregar(linea) {
    setLineas((actual) => {
      const clave = `${linea.productoId}-${linea.talla}-${linea.precio}`;
      const existe = actual.find((l) => l.clave === clave);
      if (existe) return actual.map((l) => (l.clave === clave ? { ...l, cantidad: l.cantidad + linea.cantidad } : l));
      return [...actual, { ...linea, clave }];
    });
    setElegido(null);
    setBusqueda("");
  }

  function cambiarLinea(clave, cambios) {
    setLineas((actual) =>
      actual.map((l) => (l.clave === clave ? { ...l, ...cambios } : l)).filter((l) => l.cantidad > 0)
    );
  }

  async function registrar() {
    setGuardando(true);
    setError("");
    const { data, error } = await obtenerClienteNavegador().rpc("registrar_venta_tienda", {
      p_items: lineas.map((l) => ({ productoId: l.productoId, talla: l.talla, cantidad: l.cantidad, precio: l.precio })),
      p_metodo_pago: metodo,
      p_cliente_nombre: cliente.nombre || null,
      p_cliente_telefono: cliente.telefono || null,
      p_notas: null,
    });
    setGuardando(false);
    if (error) {
      setError(error.message || "No se pudo registrar la venta.");
      return;
    }
    setExito({ ...data, metodo });
    setCobrando(false);
    setLineas([]);
    setCliente({ nombre: "", telefono: "" });
    lanzarConfeti();
    if (navigator.vibrate) navigator.vibrate([40, 60, 40]);
    cargar();
    refrescarTienda();
  }

  function nuevaVenta() {
    setExito(null);
    setMetodo("efectivo");
    setTimeout(() => buscador.current?.focus(), 50);
  }

  return (
    <div className="-mx-4 -my-8 min-h-[calc(100vh-7rem)] bg-hueso px-4 pb-32 pt-4">
      {/* Buscador */}
      <div className="sticky top-[6.5rem] z-10 -mx-4 bg-hueso/95 px-4 pb-3 pt-1 backdrop-blur">
        <div className="flex items-center justify-between pb-2">
          <h1 className="font-serif text-2xl">Nueva venta</h1>
          <Link href="/admin/pedidos" className="text-xs underline underline-offset-4">Ver ventas</Link>
        </div>
        <input
          ref={buscador}
          type="search"
          inputMode="search"
          autoFocus
          className="campo py-3.5 text-base"
          placeholder="Buscar por nombre o código..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      {/* Resultados */}
      {cargando ? (
        <p className="mt-6 text-center text-sm text-marino/60">Cargando productos...</p>
      ) : (
        <>
          {!busqueda && <p className="mb-2 mt-1 text-xs text-marino/50">Productos con stock</p>}
          <ul className="space-y-2">
            {resultados.map((p) => {
              const tallas = ordenarTallas(p.tallas || []);
              const sinStock = stockTotal(tallas) === 0;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={sinStock}
                    onClick={() => setElegido(p)}
                    className="flex w-full items-center gap-3 rounded-xl bg-white p-2.5 text-left shadow-sm transition active:scale-[0.99] disabled:opacity-45"
                  >
                    <div className="aspect-[3/4] w-12 shrink-0 overflow-hidden rounded-lg bg-hueso-oscuro">
                      {p.imagenes?.[0] ? (
                        <img src={p.imagenes[0]} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <img src="/marca/grifo-negro.webp" alt="" className="mx-auto mt-3 h-8 w-auto opacity-15" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.nombre}</p>
                      <p className="text-[11px] text-marino/50">{p.sku}</p>
                      <p className="mt-0.5 flex gap-1.5 text-[11px]">
                        {tallas.map((t) => (
                          <span key={t.talla} className={t.stock > 0 ? "font-semibold" : "text-marino/30 line-through"}>
                            {t.talla}·{t.stock}
                          </span>
                        ))}
                      </p>
                    </div>
                    <span className="text-sm font-semibold">{formatearPrecio(p.precio)}</span>
                  </button>
                </li>
              );
            })}
            {resultados.length === 0 && <li className="py-8 text-center text-sm text-marino/60">Sin resultados para “{busqueda}”.</li>}
          </ul>
        </>
      )}

      {/* Barra inferior con el total */}
      {lineas.length > 0 && !cobrando && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-marino/10 bg-white p-3 shadow-[0_-10px_30px_-15px_rgba(31,42,68,0.4)]">
          <button type="button" onClick={() => setCobrando(true)} className="btn-ocre w-full justify-between py-4 text-base">
            <span>{prendas} {prendas === 1 ? "prenda" : "prendas"}</span>
            <span>Cobrar {formatearPrecio(total)} →</span>
          </button>
        </div>
      )}

      {/* Hoja: elegir talla, cantidad y precio */}
      {elegido && <HojaAgregar producto={elegido} onCerrar={() => setElegido(null)} onAgregar={agregar} />}

      {/* Hoja: cobrar */}
      {cobrando && (
        <Hoja onCerrar={() => setCobrando(false)} titulo="Cobrar venta">
          <ul className="divide-y divide-marino/10">
            {lineas.map((l) => (
              <li key={l.clave} className="flex items-center gap-2 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{l.nombre}</p>
                  <p className="text-xs text-marino/60">Talla {l.talla}</p>
                </div>
                <div className="flex items-center rounded-full border border-marino/20">
                  <button type="button" className="h-9 w-9 text-lg" onClick={() => cambiarLinea(l.clave, { cantidad: l.cantidad - 1 })} aria-label="Restar">−</button>
                  <span className="w-6 text-center text-sm font-semibold">{l.cantidad}</span>
                  <button
                    type="button"
                    className="h-9 w-9 text-lg disabled:opacity-30"
                    disabled={l.cantidad >= l.stock}
                    onClick={() => cambiarLinea(l.clave, { cantidad: l.cantidad + 1 })}
                    aria-label="Sumar"
                  >
                    +
                  </button>
                </div>
                <label className="flex items-center text-sm">
                  $
                  <input
                    className="campo ml-1 w-20 px-2 py-1.5 text-right"
                    inputMode="decimal"
                    defaultValue={l.precio.toFixed(2)}
                    onBlur={(e) => {
                      const n = aNumero(e.target.value);
                      if (n !== null && n >= 0) cambiarLinea(l.clave, { precio: n });
                    }}
                  />
                </label>
              </li>
            ))}
          </ul>

          <p className="etiqueta mb-2 mt-5">Método de pago</p>
          <div className="grid grid-cols-3 gap-2">
            {METODOS.map((m) => (
              <button
                key={m.valor}
                type="button"
                onClick={() => setMetodo(m.valor)}
                className={`flex flex-col items-center gap-1 rounded-xl border-2 py-3 text-xs font-semibold transition ${
                  metodo === m.valor ? "border-marino bg-marino text-white" : "border-marino/15 bg-white"
                }`}
              >
                <span className="text-xl">{m.icono}</span>
                {m.texto}
              </button>
            ))}
          </div>

          <details className="mt-4 rounded-xl bg-hueso p-3 text-sm">
            <summary className="cursor-pointer text-marino/70">Datos del cliente (opcional)</summary>
            <div className="mt-3 grid gap-2">
              <input className="campo" placeholder="Nombre" value={cliente.nombre} onChange={(e) => setCliente({ ...cliente, nombre: e.target.value })} />
              <input className="campo" placeholder="Teléfono" inputMode="tel" value={cliente.telefono} onChange={(e) => setCliente({ ...cliente, telefono: e.target.value })} />
            </div>
          </details>

          {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

          <button type="button" onClick={registrar} disabled={guardando || lineas.length === 0} className="btn-ocre mt-5 w-full py-4 text-base">
            {guardando ? "Registrando..." : `Registrar venta · ${formatearPrecio(total)}`}
          </button>
        </Hoja>
      )}

      {/* Éxito */}
      {exito && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-marino/90 p-6 text-center text-hueso">
          <div className="exito-entrada">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-ocre text-4xl text-white">✓</div>
            <p className="mt-6 etiqueta text-ocre">¡Venta registrada!</p>
            <p className="mt-2 font-serif text-6xl">{formatearPrecio(exito.total)}</p>
            <p className="mt-3 text-sm text-hueso/70">
              Venta #{exito.numero} · {METODOS.find((m) => m.valor === exito.metodo)?.texto} · {exito.vendedor}
            </p>
            <button type="button" onClick={nuevaVenta} className="btn-ocre mt-8 px-10 py-4 text-base">Nueva venta</button>
            <Link href={`/admin/pedidos/${exito.id}`} className="mt-4 block text-xs text-hueso/60 underline">Ver detalle</Link>
          </div>
        </div>
      )}
    </div>
  );
}

function Hoja({ titulo, onCerrar, children }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-marino/50" onClick={onCerrar} />
      <div className="hoja-entrada relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 pb-8 sm:rounded-3xl">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-marino/15 sm:hidden" />
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-serif text-2xl">{titulo}</h2>
          <button type="button" onClick={onCerrar} className="p-1 text-2xl leading-none text-marino/50" aria-label="Cerrar">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function HojaAgregar({ producto, onCerrar, onAgregar }) {
  const tallas = ordenarTallas(producto.tallas || []);
  const [talla, setTalla] = useState(tallas.find((t) => t.stock > 0)?.talla || null);
  const [cantidad, setCantidad] = useState(1);
  const [precio, setPrecio] = useState(Number(producto.precio).toFixed(2));
  const stock = tallas.find((t) => t.talla === talla)?.stock || 0;
  const precioNum = aNumero(precio);

  return (
    <Hoja titulo={producto.nombre} onCerrar={onCerrar}>
      <p className="-mt-2 mb-4 text-xs text-marino/50">{producto.sku}</p>

      <p className="etiqueta mb-2">Talla</p>
      <div className="flex flex-wrap gap-2">
        {tallas.map((t) => (
          <button
            key={t.talla}
            type="button"
            disabled={t.stock <= 0}
            onClick={() => {
              setTalla(t.talla);
              setCantidad(1);
            }}
            className={`flex h-14 min-w-14 flex-col items-center justify-center rounded-xl border-2 px-3 text-sm font-semibold transition disabled:opacity-30 ${
              talla === t.talla ? "border-marino bg-marino text-white" : "border-marino/15"
            }`}
          >
            {t.talla}
            <span className="text-[10px] font-normal opacity-70">{t.stock} disp.</span>
          </button>
        ))}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4">
        <div>
          <p className="etiqueta mb-2">Cantidad</p>
          <div className="flex items-center justify-between rounded-xl border border-marino/20">
            <button type="button" className="h-12 w-12 text-xl" onClick={() => setCantidad((c) => Math.max(1, c - 1))} aria-label="Restar">−</button>
            <span className="text-lg font-semibold">{cantidad}</span>
            <button type="button" className="h-12 w-12 text-xl disabled:opacity-30" disabled={cantidad >= stock} onClick={() => setCantidad((c) => c + 1)} aria-label="Sumar">+</button>
          </div>
        </div>
        <label>
          <span className="etiqueta mb-2 block">Precio unitario</span>
          <span className="flex items-center rounded-xl border border-marino/20 px-3">
            $
            <input className="h-12 w-full bg-transparent pl-1 text-lg font-semibold outline-none" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} />
          </span>
        </label>
      </div>

      <button
        type="button"
        disabled={!talla || stock < cantidad || precioNum === null || precioNum < 0}
        onClick={() =>
          onAgregar({ productoId: producto.id, nombre: producto.nombre, talla, cantidad, precio: precioNum, stock })
        }
        className="btn-marino mt-6 w-full py-4 text-base"
      >
        Agregar · {formatearPrecio((precioNum || 0) * cantidad)}
      </button>
    </Hoja>
  );
}
