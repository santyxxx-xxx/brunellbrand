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

const ORDENES = [
  { clave: "nombre", texto: "A–Z" },
  { clave: "stock", texto: "Más stock" },
  { clave: "precio", texto: "Mayor precio" },
];

// Venta en tienda: categoría o búsqueda → talla y cantidad → cobrar.
// En el celular el cobro va en una hoja inferior; en la compu, en un panel a la derecha.
export default function NuevaVenta() {
  const [productos, setProductos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState(null); // id de categoría principal
  const [subcategoria, setSubcategoria] = useState(null);
  const [soloConStock, setSoloConStock] = useState(true);
  const [orden, setOrden] = useState("nombre");
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
    const supabase = obtenerClienteNavegador();
    const [{ data: prods }, cats] = await Promise.all([
      supabase
        .from("productos")
        .select("id, sku, nombre, precio, imagenes, activo, categoria_id, tallas:producto_tallas(talla, stock)")
        .order("nombre"),
      supabase.from("categorias").select("id, nombre, parent_id, orden").order("orden"),
    ]);
    let listaCats = cats.data;
    if (cats.error) {
      const r = await supabase.from("categorias").select("id, nombre, orden").order("orden");
      listaCats = r.data;
    }
    setProductos(prods || []);
    setCategorias((listaCats || []).map((c) => ({ ...c, parent_id: c.parent_id ?? null })));
    setCargando(false);
  }

  useEffect(() => {
    cargar();
  }, []);

  const principales = categorias.filter((c) => !c.parent_id);
  const hijas = categoria ? categorias.filter((c) => c.parent_id === categoria) : [];

  const conteoPorCategoria = useMemo(() => {
    const cuenta = {};
    for (const p of productos) {
      if (soloConStock && stockTotal(p.tallas) === 0) continue;
      const cat = categorias.find((c) => c.id === p.categoria_id);
      const principal = cat?.parent_id || cat?.id;
      if (principal) cuenta[principal] = (cuenta[principal] || 0) + 1;
      if (cat?.parent_id) cuenta[cat.id] = (cuenta[cat.id] || 0) + 1;
    }
    return cuenta;
  }, [productos, categorias, soloConStock]);

  const resultados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    let lista = productos;
    if (q) {
      lista = lista.filter((p) => p.nombre.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q));
    } else if (subcategoria) {
      lista = lista.filter((p) => p.categoria_id === subcategoria);
    } else if (categoria) {
      const ids = [categoria, ...hijas.map((h) => h.id)];
      lista = lista.filter((p) => ids.includes(p.categoria_id));
    }
    if (soloConStock && !q) lista = lista.filter((p) => stockTotal(p.tallas) > 0);
    const ordenada = [...lista];
    if (orden === "stock") ordenada.sort((a, b) => stockTotal(b.tallas) - stockTotal(a.tallas));
    else if (orden === "precio") ordenada.sort((a, b) => Number(b.precio) - Number(a.precio));
    // Con búsqueda, primero los que tienen stock
    if (q) ordenada.sort((a, b) => (stockTotal(b.tallas) > 0) - (stockTotal(a.tallas) > 0));
    return ordenada;
  }, [productos, busqueda, categoria, subcategoria, hijas, soloConStock, orden]);

  const total = lineas.reduce((s, l) => s + l.precio * l.cantidad, 0);
  const prendas = lineas.reduce((s, l) => s + l.cantidad, 0);
  const enCarrito = useMemo(() => {
    const m = {};
    for (const l of lineas) m[l.productoId] = (m[l.productoId] || 0) + l.cantidad;
    return m;
  }, [lineas]);

  function agregar(linea) {
    setLineas((actual) => {
      const clave = `${linea.productoId}-${linea.talla}-${linea.precio}`;
      const existe = actual.find((l) => l.clave === clave);
      if (existe) return actual.map((l) => (l.clave === clave ? { ...l, cantidad: l.cantidad + linea.cantidad } : l));
      return [...actual, { ...linea, clave }];
    });
    setElegido(null);
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
    setBusqueda("");
  }

  function elegirCategoria(id) {
    setCategoria(id);
    setSubcategoria(null);
    setBusqueda("");
  }

  const panelCobro = (
    <PanelCobro
      lineas={lineas}
      cambiarLinea={cambiarLinea}
      metodo={metodo}
      setMetodo={setMetodo}
      cliente={cliente}
      setCliente={setCliente}
      error={error}
      guardando={guardando}
      total={total}
      onRegistrar={registrar}
    />
  );

  return (
    <div className="-mx-4 -my-8 min-h-[calc(100vh-7rem)] bg-hueso px-4 pb-32 pt-4 lg:pb-10">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6">
        <div className="min-w-0">
          {/* Encabezado, buscador y categorías */}
          <div className="sticky top-[6.5rem] z-10 -mx-4 space-y-2.5 bg-hueso/95 px-4 pb-3 pt-1 backdrop-blur">
            <div className="flex items-center justify-between">
              <h1 className="font-serif text-2xl">Nueva venta</h1>
              <Link href="/admin/pedidos" className="text-xs underline underline-offset-4">Ver ventas</Link>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOrden(ORDENES[(ORDENES.findIndex((o) => o.clave === orden) + 1) % ORDENES.length].clave)}
                className="flex shrink-0 items-center gap-1 rounded-xl bg-marino px-3 text-xs font-semibold text-white"
                title="Cambiar orden"
              >
                ⇅ <span className="hidden sm:inline">{ORDENES.find((o) => o.clave === orden).texto}</span>
              </button>
              <input
                ref={buscador}
                type="search"
                inputMode="search"
                className="campo py-3 text-base"
                placeholder="Buscar por nombre o código..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
              />
            </div>

            {!busqueda && (
              <>
                <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]">
                  <Chip activo={!categoria} onClick={() => elegirCategoria(null)}>Todas</Chip>
                  {principales.map((c) => (
                    <Chip key={c.id} activo={categoria === c.id} onClick={() => elegirCategoria(c.id)}>
                      {c.nombre}
                      {conteoPorCategoria[c.id] ? <span className="ml-1 opacity-50">{conteoPorCategoria[c.id]}</span> : null}
                    </Chip>
                  ))}
                </div>
                {hijas.length > 0 && (
                  <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none]">
                    <SubChip activo={!subcategoria} onClick={() => setSubcategoria(null)}>Todas</SubChip>
                    {hijas.map((h) => (
                      <SubChip key={h.id} activo={subcategoria === h.id} onClick={() => setSubcategoria(h.id)}>
                        {h.nombre}
                        {conteoPorCategoria[h.id] ? <span className="ml-1 opacity-60">{conteoPorCategoria[h.id]}</span> : null}
                      </SubChip>
                    ))}
                  </div>
                )}
              </>
            )}
            <label className="flex items-center gap-2 text-xs text-marino/70">
              <input type="checkbox" className="h-4 w-4 accent-ocre" checked={soloConStock} onChange={(e) => setSoloConStock(e.target.checked)} />
              Solo con stock · {resultados.length} {resultados.length === 1 ? "prenda" : "prendas"}
            </label>
          </div>

          {/* Cuadrícula de productos */}
          {cargando ? (
            <p className="mt-6 text-center text-sm text-marino/60">Cargando productos...</p>
          ) : resultados.length === 0 ? (
            <p className="py-10 text-center text-sm text-marino/60">
              {busqueda ? `Sin resultados para “${busqueda}”.` : "No hay prendas con stock en esta categoría."}
            </p>
          ) : (
            <ul className="mt-1 grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {resultados.map((p) => (
                <li key={p.id}>
                  <TarjetaVenta producto={p} enCarrito={enCarrito[p.id]} onElegir={() => setElegido(p)} />
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Panel de cobro (compu) */}
        <aside className="hidden lg:block">
          <div className="sticky top-[7.5rem] max-h-[calc(100vh-8.5rem)] overflow-y-auto rounded-2xl bg-white p-5 shadow-sm">
            <h2 className="font-serif text-2xl">Venta actual</h2>
            {lineas.length === 0 ? (
              <div className="py-10 text-center text-sm text-marino/50">
                <img src="/marca/grifo-negro.webp" alt="" className="mx-auto mb-3 h-12 w-auto opacity-15" />
                Toca una prenda para agregarla.
              </div>
            ) : (
              panelCobro
            )}
          </div>
        </aside>
      </div>

      {/* Barra inferior con el total (celular) */}
      {lineas.length > 0 && !cobrando && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-marino/10 bg-white p-3 shadow-[0_-10px_30px_-15px_rgba(31,42,68,0.4)] lg:hidden">
          <button type="button" onClick={() => setCobrando(true)} className="btn-ocre w-full justify-between py-4 text-base">
            <span>{prendas} {prendas === 1 ? "prenda" : "prendas"}</span>
            <span>Cobrar {formatearPrecio(total)} →</span>
          </button>
        </div>
      )}

      {/* Hoja: elegir talla, cantidad y precio */}
      {elegido && <HojaAgregar producto={elegido} onCerrar={() => setElegido(null)} onAgregar={agregar} />}

      {/* Hoja: cobrar (celular) */}
      {cobrando && (
        <Hoja onCerrar={() => setCobrando(false)} titulo="Cobrar venta">
          {panelCobro}
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

function Chip({ activo, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-lg border px-3.5 py-1.5 text-xs font-medium transition ${
        activo ? "border-ocre bg-ocre text-white" : "border-marino/15 bg-white hover:border-marino/40"
      }`}
    >
      {children}
    </button>
  );
}

function SubChip({ activo, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1 text-[11px] transition ${activo ? "bg-marino text-white" : "bg-hueso-oscuro text-marino"}`}
    >
      {children}
    </button>
  );
}

function TarjetaVenta({ producto: p, enCarrito, onElegir }) {
  const stock = stockTotal(p.tallas);
  const agotado = stock === 0;
  const insignia = agotado
    ? "bg-red-100 text-red-700"
    : stock <= 2
      ? "bg-amber-100 text-amber-800"
      : "bg-green-100 text-green-800";
  return (
    <button
      type="button"
      disabled={agotado}
      onClick={onElegir}
      className="relative flex h-full w-full flex-col items-center rounded-2xl border border-marino/10 bg-white p-2.5 text-center transition hover:border-ocre hover:shadow-md active:scale-[0.98] disabled:opacity-50 disabled:hover:border-marino/10 disabled:hover:shadow-none"
    >
      {enCarrito && (
        <span className="absolute right-2 top-2 z-[1] flex h-6 min-w-6 items-center justify-center rounded-full bg-ocre px-1.5 text-[11px] font-bold text-white">
          {enCarrito}
        </span>
      )}
      <div className="aspect-square w-full overflow-hidden rounded-xl bg-hueso">
        {p.imagenes?.[0] ? (
          <img src={p.imagenes[0]} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <img src="/marca/grifo-negro.webp" alt="" className="h-1/2 w-auto opacity-10" />
          </div>
        )}
      </div>
      <p className="mt-2 text-base font-semibold">{formatearPrecio(p.precio)}</p>
      <p className="line-clamp-2 min-h-[2.5em] text-xs leading-tight text-marino/80">{p.nombre}</p>
      <span className={`mt-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold ${insignia}`}>
        {agotado ? "Agotado" : `${stock} disponibles`}
      </span>
    </button>
  );
}

function PanelCobro({ lineas, cambiarLinea, metodo, setMetodo, cliente, setCliente, error, guardando, total, onRegistrar }) {
  return (
    <div>
      <ul className="divide-y divide-marino/10">
        {lineas.map((l) => (
          <li key={l.clave} className="flex items-center gap-2 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{l.nombre}</p>
              <p className="text-xs text-marino/60">Talla {l.talla}</p>
            </div>
            <div className="flex items-center rounded-full border border-marino/20">
              <button type="button" className="h-8 w-8 text-lg" onClick={() => cambiarLinea(l.clave, { cantidad: l.cantidad - 1 })} aria-label="Restar">−</button>
              <span className="w-5 text-center text-sm font-semibold">{l.cantidad}</span>
              <button
                type="button"
                className="h-8 w-8 text-lg disabled:opacity-30"
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
                key={`${l.clave}-${l.precio}`}
                className="campo ml-1 w-[4.5rem] px-2 py-1.5 text-right"
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

      <div className="mt-5 flex items-baseline justify-between border-t border-marino/10 pt-4">
        <span className="text-sm">Total</span>
        <span className="font-serif text-3xl">{formatearPrecio(total)}</span>
      </div>
      <button type="button" onClick={onRegistrar} disabled={guardando || lineas.length === 0} className="btn-ocre mt-4 w-full py-4 text-base">
        {guardando ? "Registrando..." : "Registrar venta"}
      </button>
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
