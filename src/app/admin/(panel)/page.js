"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { obtenerClienteNavegador } from "@/lib/supabase/cliente";
import { borrarFotos, consultarConFase5, refrescarTienda } from "@/lib/admin";
import { formatearPrecio, nombreInterno, nombreWeb, ordenarTallas, stockTotal } from "@/lib/utilidades";

const normalizar = (t) =>
  String(t || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

// Productos en cuadrícula por categorías (igual que en Vender). En el panel se ve el nombre interno.
export default function ListaProductos() {
  const [productos, setProductos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [categoria, setCategoria] = useState(null);
  const [subcategoria, setSubcategoria] = useState(null);
  const [soloConStock, setSoloConStock] = useState(false);
  const [mensaje, setMensaje] = useState("");

  async function cargar() {
    setCargando(true);
    const supabase = obtenerClienteNavegador();
    const [{ data, error }, cats] = await Promise.all([
      consultarConFase5(
        (campos) => supabase.from("productos").select(campos).order("nombre"),
        "id, sku, nombre, nombre_interno, opcion, marca, slug, precio, imagenes, destacado, activo, categoria_id, tallas:producto_tallas(talla, stock)"
      ),
      consultarConFase5(
        (campos) => supabase.from("categorias").select(campos).order("orden"),
        "id, nombre, parent_id, orden, visible"
      ),
    ]);
    if (error) setMensaje(`Error al cargar: ${error.message}`);
    setProductos(data || []);
    setCategorias((cats.data || []).map((c) => ({ ...c, parent_id: c.parent_id ?? null, visible: c.visible !== false })));
    setCargando(false);
  }

  useEffect(() => {
    cargar();
  }, []);

  const principales = categorias.filter((c) => !c.parent_id);
  const hijas = categoria ? categorias.filter((c) => c.parent_id === categoria) : [];
  const catPorId = useMemo(() => new Map(categorias.map((c) => [c.id, c])), [categorias]);

  // Una prenda no sale en la web si está oculta o si su categoría (o la principal) está oculta
  const ocultaEnWeb = (p) => {
    const cat = catPorId.get(p.categoria_id);
    const padre = cat?.parent_id ? catPorId.get(cat.parent_id) : null;
    return !p.activo || cat?.visible === false || padre?.visible === false;
  };

  const conteo = useMemo(() => {
    const cuenta = {};
    for (const p of productos) {
      if (soloConStock && stockTotal(p.tallas) === 0) continue;
      const cat = catPorId.get(p.categoria_id);
      const principal = cat?.parent_id || cat?.id;
      if (principal) cuenta[principal] = (cuenta[principal] || 0) + 1;
      if (cat?.parent_id) cuenta[cat.id] = (cuenta[cat.id] || 0) + 1;
    }
    return cuenta;
  }, [productos, catPorId, soloConStock]);

  const resultados = useMemo(() => {
    const palabras = normalizar(busqueda).split(/\s+/).filter(Boolean);
    let lista = productos;
    if (palabras.length) {
      lista = lista.filter((p) => {
        const texto = normalizar(`${p.nombre} ${p.nombre_interno || ""} ${p.sku}`);
        return palabras.every((w) => texto.includes(w));
      });
    } else if (subcategoria) {
      lista = lista.filter((p) => p.categoria_id === subcategoria);
    } else if (categoria) {
      const ids = [categoria, ...hijas.map((h) => h.id)];
      lista = lista.filter((p) => ids.includes(p.categoria_id));
    }
    if (soloConStock) lista = lista.filter((p) => stockTotal(p.tallas) > 0);
    return lista;
  }, [productos, busqueda, categoria, subcategoria, hijas, soloConStock]);

  function elegirCategoria(id) {
    setCategoria(id);
    setSubcategoria(null);
  }

  async function eliminar(producto) {
    if (!confirm(`¿Eliminar "${nombreInterno(producto)}"? Esta acción no se puede deshacer.`)) return;
    const { error } = await obtenerClienteNavegador().from("productos").delete().eq("id", producto.id);
    if (error) return setMensaje(`No se pudo eliminar: ${error.message}`);
    await borrarFotos(producto.imagenes);
    setProductos((lista) => lista.filter((p) => p.id !== producto.id));
    setMensaje(`"${nombreInterno(producto)}" eliminado.`);
    refrescarTienda();
  }

  const unidades = productos.reduce((s, p) => s + stockTotal(p.tallas), 0);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl">Productos</h1>
          <p className="text-sm text-marino/60">
            {productos.length} productos · {unidades} prendas en stock
          </p>
        </div>
        <Link href="/admin/productos/nuevo" className="btn-ocre">+ Nuevo producto</Link>
      </div>

      <div className="sticky top-[6.5rem] z-10 -mx-4 mt-4 space-y-2.5 bg-hueso/95 px-4 pb-3 pt-1 backdrop-blur">
        <input
          type="search"
          className="campo"
          placeholder="Buscar por nombre (interno o de la web) o código..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        {!busqueda && (
          <>
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]">
              <Chip activo={!categoria} onClick={() => elegirCategoria(null)}>Todas</Chip>
              {principales.map((c) => (
                <Chip key={c.id} activo={categoria === c.id} onClick={() => elegirCategoria(c.id)}>
                  {c.nombre}
                  {!c.visible && <span title="No se ve en la web"> 🔒</span>}
                  {conteo[c.id] ? <span className="ml-1 opacity-50">{conteo[c.id]}</span> : null}
                </Chip>
              ))}
            </div>
            {hijas.length > 0 && (
              <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 [scrollbar-width:none]">
                <SubChip activo={!subcategoria} onClick={() => setSubcategoria(null)}>Todas</SubChip>
                {hijas.map((h) => (
                  <SubChip key={h.id} activo={subcategoria === h.id} onClick={() => setSubcategoria(h.id)}>
                    {h.nombre}
                    {conteo[h.id] ? <span className="ml-1 opacity-60">{conteo[h.id]}</span> : null}
                  </SubChip>
                ))}
              </div>
            )}
          </>
        )}
        <label className="flex items-center gap-2 text-xs text-marino/70">
          <input type="checkbox" className="h-4 w-4 accent-ocre" checked={soloConStock} onChange={(e) => setSoloConStock(e.target.checked)} />
          Solo con stock · {resultados.length} {resultados.length === 1 ? "producto" : "productos"}
        </label>
      </div>

      {mensaje && <p className="mt-2 rounded-lg bg-white p-3 text-sm">{mensaje}</p>}

      {cargando ? (
        <p className="mt-8 text-sm text-marino/60">Cargando productos...</p>
      ) : resultados.length === 0 ? (
        <div className="mt-6 rounded-xl bg-white p-8 text-center text-sm text-marino/60">
          {busqueda ? `Sin resultados para “${busqueda}”.` : "No hay productos en esta categoría."}
        </div>
      ) : (
        <ul className="mt-2 grid grid-cols-3 gap-2 sm:gap-3">
          {resultados.map((p) => {
            const tallas = ordenarTallas(p.tallas || []);
            const total = stockTotal(tallas);
            const oculta = ocultaEnWeb(p);
            return (
              <li key={p.id} className="flex flex-col overflow-hidden rounded-xl bg-white">
                <Link href={`/admin/productos/${p.id}`} className="block flex-1">
                  <div className="relative aspect-[3/4] bg-hueso-oscuro">
                    {p.imagenes?.[0] ? (
                      <img src={p.imagenes[0]} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <img src="/marca/grifo-negro.webp" alt="" className="h-8 w-auto opacity-15 sm:h-12" />
                      </div>
                    )}
                    <div className="absolute left-1 top-1 flex flex-col items-start gap-0.5">
                      {total === 0 && <Insignia className="bg-red-600 text-white">Agotado</Insignia>}
                      {oculta && <Insignia className="bg-marino text-white">Solo panel</Insignia>}
                      {p.destacado && <Insignia className="bg-ocre text-white">Destacado</Insignia>}
                    </div>
                  </div>
                  <div className="space-y-0.5 p-2 sm:p-3">
                    <p className="line-clamp-2 text-[11px] font-medium leading-tight sm:text-sm">{nombreInterno(p)}</p>
                    {p.nombre_interno && p.nombre_interno !== nombreWeb(p) && (
                      <p className="line-clamp-1 text-[10px] text-marino/50 sm:text-xs" title="Nombre en la web">
                        🌐 {nombreWeb(p)}
                        {p.opcion ? ` · ${p.opcion}` : ""}
                      </p>
                    )}
                    <p className="text-[11px] font-semibold sm:text-sm">{formatearPrecio(p.precio)}</p>
                    <p className="flex flex-wrap gap-x-1.5 text-[10px] sm:text-xs">
                      {tallas.map((t) => (
                        <span key={t.talla} className={t.stock > 0 ? "" : "text-red-600/70"}>
                          {t.talla}:{t.stock}
                        </span>
                      ))}
                    </p>
                  </div>
                </Link>
                <div className="flex border-t border-marino/10 text-[10px] sm:text-xs">
                  <Link href={`/admin/productos/${p.id}`} className="flex-1 py-1.5 text-center hover:bg-hueso">
                    Editar
                  </Link>
                  <button type="button" onClick={() => eliminar(p)} className="flex-1 border-l border-marino/10 py-1.5 text-red-700 hover:bg-red-50">
                    Borrar
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Insignia({ className, children }) {
  return <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide sm:text-[10px] ${className}`}>{children}</span>;
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
