"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { obtenerClienteNavegador } from "@/lib/supabase/cliente";
import { borrarFotos, refrescarTienda } from "@/lib/admin";
import { formatearPrecio, ordenarTallas, stockTotal } from "@/lib/utilidades";

export default function ListaProductos() {
  const [productos, setProductos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [mensaje, setMensaje] = useState("");

  async function cargar() {
    setCargando(true);
    const supabase = obtenerClienteNavegador();
    const { data, error } = await supabase
      .from("productos")
      .select("id, sku, nombre, slug, precio, imagenes, destacado, activo, categoria:categorias(nombre), tallas:producto_tallas(talla, stock)")
      .order("creado_en", { ascending: false });
    if (error) setMensaje(`Error al cargar: ${error.message}`);
    setProductos(data || []);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
  }, []);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return productos;
    return productos.filter(
      (p) => p.nombre.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
    );
  }, [productos, busqueda]);

  async function eliminar(producto) {
    if (!confirm(`¿Eliminar "${producto.nombre}"? Esta acción no se puede deshacer.`)) return;
    const supabase = obtenerClienteNavegador();
    const { error } = await supabase.from("productos").delete().eq("id", producto.id);
    if (error) {
      setMensaje(`No se pudo eliminar: ${error.message}`);
      return;
    }
    await borrarFotos(producto.imagenes);
    setProductos((lista) => lista.filter((p) => p.id !== producto.id));
    setMensaje(`"${producto.nombre}" eliminado.`);
    refrescarTienda();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl">Productos</h1>
          <p className="text-sm text-marino/60">{productos.length} en total</p>
        </div>
        <Link href="/admin/productos/nuevo" className="btn-ocre">+ Nuevo producto</Link>
      </div>

      <input
        className="campo mt-6"
        placeholder="Buscar por nombre o código..."
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
      />

      {mensaje && <p className="mt-4 rounded-lg bg-white p-3 text-sm">{mensaje}</p>}

      {cargando ? (
        <p className="mt-8 text-sm text-marino/60">Cargando productos...</p>
      ) : filtrados.length === 0 ? (
        <div className="mt-8 rounded-xl bg-white p-8 text-center text-sm text-marino/60">
          No hay productos. Crea uno nuevo o importa tu inventario desde un CSV.
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-marino/10 overflow-hidden rounded-xl bg-white">
          {filtrados.map((p) => {
            const tallas = ordenarTallas(p.tallas || []);
            const total = stockTotal(tallas);
            return (
              <li key={p.id} className="flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
                <div className="aspect-[3/4] w-14 shrink-0 overflow-hidden rounded-md bg-hueso-oscuro">
                  {p.imagenes?.[0] && <img src={p.imagenes[0]} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.nombre}</p>
                  <p className="text-xs text-marino/60">
                    {p.sku} · {p.categoria?.nombre || "Sin categoría"} · {formatearPrecio(p.precio)}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-2 text-xs">
                    {tallas.map((t) => (
                      <span key={t.talla} className={t.stock > 0 ? "" : "text-red-600"}>
                        {t.talla}: {t.stock}
                      </span>
                    ))}
                    <span className={`font-semibold ${total === 0 ? "text-red-600" : ""}`}>Total: {total}</span>
                    {!p.activo && <span className="rounded bg-marino/10 px-1.5">Oculto</span>}
                    {p.destacado && <span className="rounded bg-ocre/20 px-1.5">Destacado</span>}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col gap-1 sm:flex-row sm:gap-2">
                  <Link href={`/admin/productos/${p.id}`} className="rounded-full border border-marino/20 px-3 py-1.5 text-center text-xs hover:border-marino">
                    Editar
                  </Link>
                  <button type="button" onClick={() => eliminar(p)} className="rounded-full border border-red-200 px-3 py-1.5 text-xs text-red-700 hover:bg-red-50">
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
