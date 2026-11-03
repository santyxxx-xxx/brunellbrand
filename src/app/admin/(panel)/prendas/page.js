"use client";

import { useEffect, useMemo, useState } from "react";
import { obtenerClienteNavegador } from "@/lib/supabase/cliente";

const FILTROS = [
  { clave: "revisar", texto: "Por revisar", estados: ["dudoso", "sin_coincidencia"] },
  { clave: "automatico", texto: "Automáticas", estados: ["automatico"] },
  { clave: "confirmado", texto: "Confirmadas", estados: ["confirmado"] },
  { clave: "descartado", texto: "No están en catálogo", estados: ["descartado"] },
  { clave: "todas", texto: "Todas", estados: null },
];

const ETIQUETA = {
  automatico: { texto: "Automática", color: "bg-blue-100 text-blue-800" },
  dudoso: { texto: "Dudosa", color: "bg-amber-100 text-amber-800" },
  sin_coincidencia: { texto: "Sin coincidencia", color: "bg-red-100 text-red-700" },
  confirmado: { texto: "Confirmada", color: "bg-green-100 text-green-800" },
  descartado: { texto: "No está en catálogo", color: "bg-marino/10 text-marino" },
};

const normalizar = (t) =>
  String(t || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

// Revisión de prendas del historial de Treinta vs. catálogo actual.
// Nada se vincula sin tu confirmación, salvo coincidencias exactas (que también puedes corregir aquí).
export default function PrendasHistoricas() {
  const [prendas, setPrendas] = useState([]);
  const [catalogo, setCatalogo] = useState([]);
  const [filtro, setFiltro] = useState("revisar");
  const [eligiendo, setEligiendo] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [usuario, setUsuario] = useState("");
  const [error, setError] = useState("");

  async function cargar() {
    const supabase = obtenerClienteNavegador();
    const [{ data, error }, { data: prods }, { data: rol }] = await Promise.all([
      supabase
        .from("prendas_historicas")
        .select(
          "clave, nombre, unidades, estado, confianza, producto_id, sugerido_id, revisado_por, revisado_en, producto:productos!prendas_historicas_producto_id_fkey(nombre, sku), sugerido:productos!prendas_historicas_sugerido_id_fkey(nombre, sku)"
        )
        .order("unidades", { ascending: false }),
      supabase.from("productos").select("id, nombre, sku").order("nombre"),
      supabase.rpc("mi_rol"),
    ]);
    if (error) setError(error.message);
    setPrendas(data || []);
    setCatalogo(prods || []);
    setUsuario(rol?.nombre || "");
  }

  useEffect(() => {
    cargar();
  }, []);

  async function guardar(prenda, cambios) {
    setError("");
    const { error } = await obtenerClienteNavegador()
      .from("prendas_historicas")
      .update({ ...cambios, revisado_por: usuario || null, revisado_en: new Date().toISOString() })
      .eq("clave", prenda.clave);
    if (error) return setError(error.message);
    setEligiendo(null);
    setBusqueda("");
    cargar();
  }

  const confirmar = (p, productoId) => guardar(p, { estado: "confirmado", producto_id: productoId });
  const descartar = (p) => guardar(p, { estado: "descartado", producto_id: null });
  const deshacer = (p) => guardar(p, { estado: p.sugerido_id ? "dudoso" : "sin_coincidencia", producto_id: null });

  const visibles = useMemo(() => {
    const f = FILTROS.find((x) => x.clave === filtro);
    return f.estados ? prendas.filter((p) => f.estados.includes(p.estado)) : prendas;
  }, [prendas, filtro]);

  const candidatos = useMemo(() => {
    const q = normalizar(busqueda);
    const palabras = q.split(/\s+/).filter(Boolean);
    if (!palabras.length) return [];
    return catalogo.filter((c) => palabras.every((w) => normalizar(`${c.nombre} ${c.sku}`).includes(w))).slice(0, 8);
  }, [catalogo, busqueda]);

  const conteo = (estados) => prendas.filter((p) => !estados || estados.includes(p.estado)).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-3xl">Prendas del historial</h1>
        <p className="mt-1 max-w-2xl text-sm text-marino/60">
          Relaciona las prendas vendidas en Treinta con tu catálogo actual. Las “automáticas” tienen el mismo nombre y corte;
          las dudosas y las que no se encontraron esperan tu decisión. Esto solo afecta los reportes: no cambia stock ni productos.
        </p>
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {FILTROS.map((f) => (
          <button
            key={f.clave}
            type="button"
            onClick={() => setFiltro(f.clave)}
            className={`shrink-0 rounded-full border px-4 py-1.5 text-sm ${
              filtro === f.clave ? "border-marino bg-marino text-white" : "border-marino/20 bg-white"
            }`}
          >
            {f.texto} <span className="opacity-60">{conteo(f.estados)}</span>
          </button>
        ))}
      </div>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {visibles.length === 0 ? (
        <p className="rounded-xl bg-white p-8 text-center text-sm text-marino/60">
          {filtro === "revisar" ? "¡Listo! No quedan prendas por revisar." : "No hay prendas en este grupo."}
        </p>
      ) : (
        <ul className="space-y-3">
          {visibles.map((p) => {
            const vinculado = p.producto?.nombre;
            return (
              <li key={p.clave} className="rounded-xl bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-marino/50">En Treinta</p>
                    <p className="font-medium">{p.nombre}</p>
                    <p className="text-xs text-marino/60">{p.unidades} {p.unidades === 1 ? "unidad vendida" : "unidades vendidas"}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${ETIQUETA[p.estado].color}`}>
                    {ETIQUETA[p.estado].texto}
                  </span>
                </div>

                <div className="mt-3 rounded-lg bg-hueso p-3 text-sm">
                  {vinculado ? (
                    <p>
                      <span className="text-xs text-marino/50">En el catálogo: </span>
                      <strong>{p.producto.nombre}</strong> <span className="text-xs text-marino/50">{p.producto.sku}</span>
                    </p>
                  ) : p.sugerido?.nombre && p.estado === "dudoso" ? (
                    <p>
                      <span className="text-xs text-marino/50">¿Es esta? </span>
                      <strong>{p.sugerido.nombre}</strong> <span className="text-xs text-marino/50">{p.sugerido.sku}</span>
                    </p>
                  ) : p.estado === "descartado" ? (
                    <p className="text-marino/60">Marcada como prenda que no está en el catálogo actual.</p>
                  ) : (
                    <p className="text-marino/60">No se encontró una prenda parecida en el catálogo.</p>
                  )}
                  {p.revisado_por && (
                    <p className="mt-1 text-[11px] text-marino/40">
                      Revisado por {p.revisado_por} · {new Date(p.revisado_en).toLocaleDateString("es-EC")}
                    </p>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {p.estado === "dudoso" && p.sugerido_id && (
                    <button type="button" onClick={() => confirmar(p, p.sugerido_id)} className="rounded-full bg-marino px-3 py-1.5 font-semibold text-white">
                      Sí, es esta
                    </button>
                  )}
                  {p.estado === "automatico" && (
                    <button type="button" onClick={() => confirmar(p, p.producto_id)} className="rounded-full bg-marino px-3 py-1.5 font-semibold text-white">
                      Correcto
                    </button>
                  )}
                  {["dudoso", "sin_coincidencia", "automatico"].includes(p.estado) && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEligiendo(eligiendo === p.clave ? null : p.clave);
                          setBusqueda("");
                        }}
                        className="rounded-full border border-marino/20 px-3 py-1.5"
                      >
                        {p.estado === "sin_coincidencia" ? "Elegir producto" : "Elegir otro"}
                      </button>
                      <button type="button" onClick={() => descartar(p)} className="rounded-full border border-marino/20 px-3 py-1.5">
                        No está en el catálogo
                      </button>
                    </>
                  )}
                  {["confirmado", "descartado"].includes(p.estado) && (
                    <button type="button" onClick={() => deshacer(p)} className="rounded-full border border-marino/20 px-3 py-1.5">
                      Deshacer
                    </button>
                  )}
                </div>

                {eligiendo === p.clave && (
                  <div className="mt-3">
                    <input
                      autoFocus
                      className="campo"
                      placeholder="Buscar en el catálogo por nombre o código..."
                      value={busqueda}
                      onChange={(e) => setBusqueda(e.target.value)}
                    />
                    <ul className="mt-2 divide-y divide-marino/10 rounded-lg border border-marino/10">
                      {candidatos.map((c) => (
                        <li key={c.id}>
                          <button type="button" onClick={() => confirmar(p, c.id)} className="flex w-full justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-hueso">
                            <span>{c.nombre}</span>
                            <span className="text-xs text-marino/40">{c.sku}</span>
                          </button>
                        </li>
                      ))}
                      {busqueda && candidatos.length === 0 && <li className="px-3 py-2 text-xs text-marino/50">Sin resultados.</li>}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
