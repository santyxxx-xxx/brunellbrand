"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { obtenerClienteNavegador } from "@/lib/supabase/cliente";
import { ESTADOS_PEDIDO } from "@/config/envios";
import { formatearPrecio } from "@/lib/utilidades";

const FILTROS = [{ clave: "", texto: "Todos" }, ...Object.entries(ESTADOS_PEDIDO).map(([clave, e]) => ({ clave, texto: e.texto }))];

export default function ListaPedidos() {
  const [pedidos, setPedidos] = useState([]);
  const [estado, setEstado] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      setCargando(true);
      let consulta = obtenerClienteNavegador()
        .from("orders")
        .select("id, numero, estado, cliente_nombre, cliente_telefono, provincia, ciudad, envio_nombre, total, creado_en, numero_guia, stock_insuficiente")
        .order("creado_en", { ascending: false })
        .limit(300);
      if (estado) consulta = consulta.eq("estado", estado);
      const { data, error } = await consulta;
      if (error) setError(error.message);
      setPedidos(data || []);
      setCargando(false);
    })();
  }, [estado]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase().replace("#", "");
    if (!q) return pedidos;
    return pedidos.filter(
      (p) => String(p.numero).includes(q) || p.cliente_nombre.toLowerCase().includes(q) || (p.cliente_telefono || "").includes(q)
    );
  }, [pedidos, busqueda]);

  return (
    <div>
      <h1 className="font-serif text-3xl">Pedidos</h1>

      <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
        {FILTROS.map((f) => (
          <button
            key={f.clave}
            type="button"
            onClick={() => setEstado(f.clave)}
            className={`shrink-0 rounded-full border px-4 py-1.5 text-sm transition ${
              estado === f.clave ? "border-marino bg-marino text-white" : "border-marino/20 bg-white hover:border-marino"
            }`}
          >
            {f.texto}
          </button>
        ))}
      </div>

      <input className="campo mt-4" placeholder="Buscar por número, nombre o teléfono..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />

      {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {cargando ? (
        <p className="mt-8 text-sm text-marino/60">Cargando pedidos...</p>
      ) : filtrados.length === 0 ? (
        <p className="mt-8 rounded-xl bg-white p-8 text-center text-sm text-marino/60">No hay pedidos con este filtro.</p>
      ) : (
        <ul className="mt-6 divide-y divide-marino/10 overflow-hidden rounded-xl bg-white">
          {filtrados.map((p) => (
            <li key={p.id}>
              <Link href={`/admin/pedidos/${p.id}`} className="flex items-center gap-3 p-4 transition hover:bg-hueso">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <strong>#{p.numero}</strong>
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${ESTADOS_PEDIDO[p.estado]?.color}`}>
                      {ESTADOS_PEDIDO[p.estado]?.texto}
                    </span>
                    {p.stock_insuficiente && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] text-red-700">Revisar stock</span>}
                  </p>
                  <p className="mt-1 truncate text-sm">{p.cliente_nombre}</p>
                  <p className="truncate text-xs text-marino/60">
                    {new Date(p.creado_en).toLocaleString("es-EC", { dateStyle: "short", timeStyle: "short" })} · {p.ciudad}, {p.provincia} · {p.envio_nombre}
                    {p.numero_guia ? ` · Guía ${p.numero_guia}` : ""}
                  </p>
                </div>
                <span className="shrink-0 font-semibold">{formatearPrecio(p.total)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
