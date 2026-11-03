"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { obtenerClienteNavegador } from "@/lib/supabase/cliente";
import { leerConfigReposicion, obtenerPorReponer } from "@/lib/reposicion";

export default function PorReponer() {
  const [config, setConfig] = useState(null);
  const [lista, setLista] = useState([]);
  const [esAdminTotal, setEsAdminTotal] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [mensaje, setMensaje] = useState("");

  async function cargar(conf) {
    setCargando(true);
    try {
      setLista(await obtenerPorReponer(obtenerClienteNavegador(), conf));
    } catch (e) {
      setMensaje(e.message);
    }
    setCargando(false);
  }

  useEffect(() => {
    const supabase = obtenerClienteNavegador();
    (async () => {
      const [conf, { data: rol }] = await Promise.all([leerConfigReposicion(supabase), supabase.rpc("mi_rol")]);
      setConfig(conf);
      setEsAdminTotal(rol?.rol === "admin");
      cargar(conf);
    })();
  }, []);

  async function guardarConfig(cambios) {
    const nueva = { ...config, ...cambios };
    setConfig(nueva);
    const supabase = obtenerClienteNavegador();
    const r = await supabase.from("configuracion").upsert([
      { clave: "umbral_stock", valor: nueva.umbral },
      { clave: "correo_reposicion", valor: { activo: nueva.correoActivo, solo_activos: nueva.soloActivos } },
    ]);
    setMensaje(r.error ? `Error: ${r.error.message}` : "Configuración guardada.");
    cargar(nueva);
  }

  const totalTallas = lista.reduce((s, p) => s + p.tallas.length, 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-3xl">Por reponer</h1>
        <p className="mt-1 text-sm text-marino/60">
          Prendas y tallas con stock de {config?.umbral ?? "…"} o menos · {lista.length} productos, {totalTallas} tallas
        </p>
      </div>

      {config && (
        <div className="flex flex-wrap items-center gap-4 rounded-xl bg-white p-4 text-sm">
          <label className="flex items-center gap-2">
            Avisar con stock de
            <select
              className="campo w-20 py-1.5"
              value={config.umbral}
              disabled={!esAdminTotal}
              onChange={(e) => guardarConfig({ umbral: Number(e.target.value) })}
            >
              {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            o menos
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-ocre" checked={config.soloActivos} disabled={!esAdminTotal} onChange={(e) => guardarConfig({ soloActivos: e.target.checked })} />
            Solo productos visibles
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-ocre" checked={config.correoActivo} disabled={!esAdminTotal} onChange={(e) => guardarConfig({ correoActivo: e.target.checked })} />
            Correo cada lunes
          </label>
          {mensaje && <span className="text-xs text-marino/60">{mensaje}</span>}
        </div>
      )}

      {cargando ? (
        <p className="text-sm text-marino/60">Cargando...</p>
      ) : lista.length === 0 ? (
        <p className="rounded-xl bg-white p-8 text-center text-sm text-marino/60">¡Todo en orden! No hay tallas con stock bajo.</p>
      ) : (
        <ul className="divide-y divide-marino/10 overflow-hidden rounded-xl bg-white">
          {lista.map((p) => (
            <li key={p.id}>
              <Link href={`/admin/productos/${p.id}`} className="flex items-center gap-3 p-3 hover:bg-hueso">
                <div className="aspect-[3/4] w-10 shrink-0 overflow-hidden rounded bg-hueso-oscuro">
                  {p.imagen && <img src={p.imagen} alt="" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.nombre}</p>
                  <p className="text-[11px] text-marino/50">{p.categoria || "Sin categoría"} · {p.sku}{!p.activo && " · oculto"}</p>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-1">
                  {p.tallas.map((t) => (
                    <span
                      key={t.talla}
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        t.stock === 0 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {t.talla}: {t.stock}
                    </span>
                  ))}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
