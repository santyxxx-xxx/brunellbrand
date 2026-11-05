"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { obtenerClienteNavegador } from "@/lib/supabase/cliente";
import { formatearPrecio } from "@/lib/utilidades";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const ORIGEN = {
  treinta: { texto: "Treinta", color: "bg-marino/10 text-marino" },
  tienda: { texto: "Panel", color: "bg-ocre/15 text-ocre-oscuro" },
  web: { texto: "Web", color: "bg-blue-100 text-blue-800" },
};
const ESTADO = {
  por_cobrar: { texto: "Por cobrar", color: "bg-orange-100 text-orange-800" },
  pagado: { texto: "Pagado", color: "bg-green-100 text-green-800" },
  enviado: { texto: "Enviado", color: "bg-blue-100 text-blue-800" },
  entregado: { texto: "Entregado", color: "bg-marino text-white" },
};
const METODO = { efectivo: "Efectivo", transferencia: "Transferencia", tarjeta: "Tarjeta", payphone: "PayPhone" };
const ENTREGA = { personal: "Entrega personal", domicilio: "A domicilio", servientrega: "Servientrega" };

const n = (v) => Number(v) || 0;
const normalizar = (t) =>
  String(t || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
const nombreMes = (yyyymm) => `${MESES[Number(yyyymm.slice(5, 7)) - 1]} ${yyyymm.slice(0, 4)}`;
const diaTexto = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString("es-EC", { weekday: "short", day: "numeric", month: "short" });

function resumir(ventas) {
  const conCosto = ventas.filter((v) => v.costo !== null && v.costo !== undefined);
  return {
    total: ventas.reduce((s, v) => s + n(v.total), 0),
    n: ventas.length,
    prendas: ventas.reduce((s, v) => s + n(v.prendas), 0),
    utilidad: conCosto.length ? conCosto.reduce((s, v) => s + n(v.total) - n(v.costo), 0) : null,
    porCobrar: ventas.filter((v) => v.estado === "por_cobrar").reduce((s, v) => s + n(v.total), 0),
  };
}

// Historial de ventas por año y mes: Treinta (2026), ventas del panel y de la web.
// 2024 y 2025 solo tienen el total de cada mes (de las notas).
export default function HistorialVentas() {
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("todas");
  const [abiertos, setAbiertos] = useState({});

  useEffect(() => {
    setCargando(true);
    obtenerClienteNavegador()
      .rpc("historial_ventas", { p_anio: anio })
      .then(({ data, error }) => {
        if (error) setError(error.message.includes("historial_ventas") ? "Falta ejecutar supabase/fase6.sql en Supabase." : error.message);
        else {
          setError("");
          setDatos(data);
          // El mes más reciente abierto
          const primero = data?.ventas?.[0]?.fecha?.slice(0, 7);
          setAbiertos(primero ? { [primero]: true } : {});
        }
        setCargando(false);
      });
  }, [anio]);

  const vendedores = useMemo(() => [...new Set((datos?.ventas || []).map((v) => v.vendedor).filter(Boolean))].sort(), [datos]);

  const ventas = useMemo(() => {
    let lista = datos?.ventas || [];
    if (filtro === "por_cobrar") lista = lista.filter((v) => v.estado === "por_cobrar");
    else if (filtro.startsWith("v:")) lista = lista.filter((v) => v.vendedor === filtro.slice(2));
    const palabras = normalizar(busqueda).split(/\s+/).filter(Boolean);
    if (palabras.length) {
      lista = lista.filter((v) => {
        const texto = normalizar(`${v.cliente || ""} ${v.detalle || ""} ${v.vendedor || ""} ${v.numero || ""}`);
        return palabras.every((w) => texto.includes(w));
      });
    }
    return lista;
  }, [datos, filtro, busqueda]);

  const meses = useMemo(() => {
    const grupos = new Map();
    for (const v of ventas) {
      const mes = v.fecha.slice(0, 7);
      if (!grupos.has(mes)) grupos.set(mes, []);
      grupos.get(mes).push(v);
    }
    return [...grupos.entries()].map(([mes, lista]) => ({ mes, lista, resumen: resumir(lista) }));
  }, [ventas]);

  const notas = datos?.meses_notas || [];
  const resumenAnio = resumir(ventas);
  const filtrando = busqueda.trim() || filtro !== "todas";
  const totalAnio = resumenAnio.total + (filtrando ? 0 : notas.reduce((s, m) => s + n(m.ventas), 0));
  const prendasAnio = resumenAnio.prendas + (filtrando ? 0 : notas.reduce((s, m) => s + n(m.prendas), 0));

  const alternar = (mes) => setAbiertos((a) => ({ ...a, [mes]: !a[mes] }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-3xl">Historial de ventas</h1>
        <p className="text-sm text-marino/60">Todas las ventas por mes: Treinta, el panel y la web.</p>
      </div>

      {datos?.dudosas > 0 && (
        <Link href="/admin/prendas" className="block rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Quedan <strong>{datos.dudosas}</strong> {datos.dudosas === 1 ? "prenda" : "prendas"} de Treinta por confirmar (por ejemplo, si era Oxford o Casual). Toca aquí para verlas →
        </Link>
      )}

      <div className="sticky top-[6.5rem] z-10 -mx-4 space-y-2 bg-hueso/95 px-4 py-2 backdrop-blur">
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4">
          {(datos?.anios || [anio]).map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => setAnio(a)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm ${anio === a ? "bg-marino text-white" : "bg-white"}`}
            >
              {a}
            </button>
          ))}
        </div>
        {(datos?.ventas?.length || 0) > 0 && (
          <>
            <input
              type="search"
              className="campo py-2.5"
              placeholder="Buscar cliente, prenda, vendedor o # de pedido..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 text-xs">
              <Filtro activo={filtro === "todas"} onClick={() => setFiltro("todas")}>Todas</Filtro>
              <Filtro activo={filtro === "por_cobrar"} onClick={() => setFiltro("por_cobrar")}>Por cobrar</Filtro>
              {vendedores.map((v) => (
                <Filtro key={v} activo={filtro === `v:${v}`} onClick={() => setFiltro(`v:${v}`)}>{v}</Filtro>
              ))}
            </div>
          </>
        )}
      </div>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {!datos && cargando ? (
        <p className="text-sm text-marino/60">Cargando historial...</p>
      ) : datos ? (
        <div className={`space-y-4 transition-opacity ${cargando ? "opacity-60" : ""}`}>
          {/* Resumen del año */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Dato titulo={filtrando ? "Ventas (filtradas)" : `Ventas ${anio}`} valor={formatearPrecio(totalAnio)} />
            <Dato titulo="Prendas" valor={prendasAnio.toLocaleString("es-EC")} />
            <Dato
              titulo="Utilidad"
              valor={resumenAnio.utilidad === null ? "—" : formatearPrecio(resumenAnio.utilidad)}
              detalle={notas.length && !filtrando ? "sin los meses de notas" : null}
            />
            <Dato
              titulo="Por cobrar"
              valor={formatearPrecio(resumenAnio.porCobrar)}
              resaltar={resumenAnio.porCobrar > 0}
            />
          </div>

          {/* Meses con detalle */}
          {meses.map(({ mes, lista, resumen }) => (
            <section key={mes} className="overflow-hidden rounded-xl bg-white">
              <button type="button" onClick={() => alternar(mes)} className="flex w-full items-center justify-between gap-3 p-4 text-left">
                <div>
                  <p className="font-serif text-xl">{nombreMes(mes)}</p>
                  <p className="text-xs text-marino/60">
                    {resumen.n} {resumen.n === 1 ? "venta" : "ventas"} · {resumen.prendas} prendas
                    {resumen.utilidad !== null && ` · utilidad ${formatearPrecio(resumen.utilidad)}`}
                    {resumen.porCobrar > 0 && <span className="text-orange-700"> · {formatearPrecio(resumen.porCobrar)} por cobrar</span>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{formatearPrecio(resumen.total)}</span>
                  <span className={`text-marino/40 transition ${abiertos[mes] ? "rotate-180" : ""}`}>▾</span>
                </div>
              </button>
              {(abiertos[mes] || filtrando) && (
                <ul className="divide-y divide-marino/10 border-t border-marino/10">
                  {lista.map((v) => (
                    <FilaVenta key={v.id} venta={v} />
                  ))}
                </ul>
              )}
            </section>
          ))}

          {/* Meses que solo tienen el total (notas) */}
          {notas.length > 0 && !filtrando && (
            <section className="rounded-xl bg-white p-4">
              <p className="etiqueta">Totales anotados</p>
              <p className="mb-3 text-xs text-marino/60">De estos meses solo existe el total (notas del celular), sin el detalle de cada venta.</p>
              <ul className="divide-y divide-marino/10 text-sm">
                {notas.map((m) => (
                  <li key={m.mes} className="flex justify-between py-2">
                    <span>{nombreMes(m.mes)}</span>
                    <span>
                      <span className="mr-3 text-xs text-marino/60">{m.prendas} prendas</span>
                      <strong>{formatearPrecio(m.ventas)}</strong>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {meses.length === 0 && (filtrando || notas.length === 0) && (
            <p className="rounded-xl bg-white p-8 text-center text-sm text-marino/60">
              {filtrando ? "No hay ventas que coincidan." : "No hay ventas en este año."}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function FilaVenta({ venta: v }) {
  const contenido = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-marino/50">
            {diaTexto(v.fecha)}
            {v.numero ? ` · #${v.numero}` : ""}
            {v.vendedor ? ` · ${v.vendedor}` : ""}
          </p>
          <p className="truncate text-sm font-medium">{v.cliente || "Cliente sin nombre"}</p>
        </div>
        <p className="shrink-0 font-semibold">{formatearPrecio(v.total)}</p>
      </div>
      {v.detalle && <p className="mt-1 line-clamp-2 text-xs text-marino/70">{v.detalle}</p>}
      <p className="mt-1.5 flex flex-wrap gap-1 text-[10px] font-semibold">
        <span className={`rounded-full px-2 py-0.5 ${ORIGEN[v.origen]?.color || "bg-marino/10"}`}>{ORIGEN[v.origen]?.texto || v.origen}</span>
        {ESTADO[v.estado] && v.estado !== "entregado" && v.estado !== "pagado" && (
          <span className={`rounded-full px-2 py-0.5 ${ESTADO[v.estado].color}`}>{ESTADO[v.estado].texto}</span>
        )}
        {v.metodo && <span className="rounded-full bg-hueso px-2 py-0.5 text-marino/70">{METODO[v.metodo] || v.metodo}</span>}
        {v.entrega && <span className="rounded-full bg-hueso px-2 py-0.5 text-marino/70">{ENTREGA[v.entrega] || v.entrega}</span>}
        <span className="rounded-full bg-hueso px-2 py-0.5 text-marino/70">{v.prendas} {n(v.prendas) === 1 ? "prenda" : "prendas"}</span>
        {v.costo !== null && v.costo !== undefined && (
          <span className="rounded-full bg-green-50 px-2 py-0.5 text-green-800">utilidad {formatearPrecio(n(v.total) - n(v.costo))}</span>
        )}
      </p>
    </>
  );
  return (
    <li>
      {v.pedido_id ? (
        <Link href={`/admin/pedidos/${v.pedido_id}`} className="block px-4 py-3 hover:bg-hueso/60">{contenido}</Link>
      ) : (
        <div className="px-4 py-3">{contenido}</div>
      )}
    </li>
  );
}

function Dato({ titulo, valor, detalle, resaltar }) {
  return (
    <div className={`rounded-xl p-3 ${resaltar ? "bg-orange-50" : "bg-white"}`}>
      <p className="text-[11px] text-marino/60">{titulo}</p>
      <p className="mt-0.5 font-serif text-xl">{valor}</p>
      {detalle && <p className="text-[10px] text-marino/50">{detalle}</p>}
    </div>
  );
}

function Filtro({ activo, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1 ${activo ? "bg-ocre text-white" : "bg-white text-marino"}`}
    >
      {children}
    </button>
  );
}
