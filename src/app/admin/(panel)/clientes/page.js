"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { obtenerClienteNavegador } from "@/lib/supabase/cliente";
import { formatearPrecio } from "@/lib/utilidades";

const n = (v) => Number(v) || 0;
const normalizar = (t) =>
  String(t || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
const fechaTexto = (iso) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString("es-EC", { day: "numeric", month: "short", year: "numeric" }) : "—";
const diasDesde = (iso) => (iso ? Math.floor((Date.now() - new Date(`${iso}T12:00:00`)) / 86400000) : null);

// 0991234567 / 991234567 / +593 99 123 4567 → 593991234567
function numeroWhatsApp(telefono) {
  let d = String(telefono || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("593")) return d.length >= 11 ? d : null;
  if (d.startsWith("0") && d.length === 10) return `593${d.slice(1)}`;
  if (d.length === 9 && d.startsWith("9")) return `593${d}`;
  return d.length >= 10 ? d : null;
}

const FILTROS = [
  { clave: "todos", texto: "Todos" },
  { clave: "mejores", texto: "Mejores clientes" },
  { clave: "dormidos", texto: "Sin comprar +90 días" },
  { clave: "deuda", texto: "Por cobrar" },
  { clave: "sin_telefono", texto: "Sin teléfono" },
];

// Directorio de clientes: respaldo de contactos y lo que compró cada uno (solo admin)
export default function Clientes() {
  const [clientes, setClientes] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [talla, setTalla] = useState(null);
  const [abierto, setAbierto] = useState(null);
  const [nuevo, setNuevo] = useState(false);

  async function cargar() {
    const { data, error } = await obtenerClienteNavegador().rpc("clientes_directorio");
    if (error) setError(error.message.includes("clientes_directorio") ? "Falta ejecutar supabase/fase7.sql en Supabase." : error.message);
    else setClientes(data || []);
    setCargando(false);
  }

  useEffect(() => {
    cargar();
  }, []);

  const lista = useMemo(() => {
    let l = clientes;
    const palabras = normalizar(busqueda).split(/\s+/).filter(Boolean);
    if (palabras.length) {
      l = l.filter((c) => {
        const texto = normalizar(`${c.nombre} ${c.telefono || ""} ${c.ciudad || ""} ${c.notas || ""} ${(c.favoritas || []).join(" ")}`);
        return palabras.every((w) => texto.includes(w));
      });
    }
    if (filtro === "mejores") l = l.filter((c) => n(c.compras) >= 2 || n(c.total) >= 200);
    if (filtro === "dormidos") l = l.filter((c) => c.ultima && diasDesde(c.ultima) > 90);
    if (filtro === "deuda") l = l.filter((c) => n(c.por_cobrar) > 0);
    if (filtro === "sin_telefono") l = l.filter((c) => !c.telefono);
    if (talla) l = l.filter((c) => n(c.tallas?.[talla]) > 0);
    return l;
  }, [clientes, busqueda, filtro, talla]);

  const conTelefono = clientes.filter((c) => c.telefono).length;

  function exportar() {
    const columnas = ["Nombre", "Teléfono", "Correo", "Ciudad", "Compras", "Total", "Prendas", "Tallas", "Primera compra", "Última compra", "Por cobrar", "Le gusta", "Notas"];
    const celda = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const filas = clientes.map((c) =>
      [
        c.nombre,
        c.telefono,
        c.correo,
        c.ciudad,
        c.compras,
        n(c.total).toFixed(2),
        c.prendas,
        Object.entries(c.tallas || {}).map(([t, u]) => `${t}:${u}`).join(" "),
        c.primera,
        c.ultima,
        n(c.por_cobrar).toFixed(2),
        (c.favoritas || []).join(", "),
        c.notas,
      ]
        .map(celda)
        .join(";")
    );
    // Punto y coma + BOM: Excel en español lo abre con columnas y tildes bien
    const contenido = "﻿" + [columnas.map(celda).join(";"), ...filas].join("\r\n");
    const enlace = document.createElement("a");
    enlace.href = URL.createObjectURL(new Blob([contenido], { type: "text/csv;charset=utf-8" }));
    enlace.download = `clientes-brunel-${new Date().toISOString().slice(0, 10)}.csv`;
    enlace.click();
    URL.revokeObjectURL(enlace.href);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl">Clientes</h1>
          <p className="text-sm text-marino/60">
            {clientes.length} clientes · {conTelefono} con teléfono
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={exportar} disabled={!clientes.length} className="btn-borde px-4 py-2 text-xs">
            Descargar Excel
          </button>
          <button type="button" onClick={() => setNuevo(true)} className="btn-ocre px-4 py-2 text-xs">
            + Cliente
          </button>
        </div>
      </div>

      {nuevo && (
        <FichaCliente
          cliente={{ nombre: "", ficha: false }}
          esNuevo
          onCerrar={() => setNuevo(false)}
          onGuardado={() => {
            setNuevo(false);
            cargar();
          }}
        />
      )}

      <div className="sticky top-[6.5rem] z-10 -mx-4 space-y-2 bg-hueso/95 px-4 py-2 backdrop-blur">
        <input
          type="search"
          className="campo py-2.5"
          placeholder="Buscar por nombre, teléfono, ciudad, notas o prenda..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 text-xs">
          {FILTROS.map((f) => (
            <button
              key={f.clave}
              type="button"
              onClick={() => setFiltro(f.clave)}
              className={`shrink-0 rounded-full px-3 py-1 ${filtro === f.clave ? "bg-ocre text-white" : "bg-white"}`}
            >
              {f.texto}
            </button>
          ))}
          <span className="mx-1 self-center text-marino/30">|</span>
          {["S", "M", "L"].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTalla(talla === t ? null : t)}
              className={`shrink-0 rounded-full px-3 py-1 ${talla === t ? "bg-marino text-white" : "bg-white"}`}
            >
              Talla {t}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-marino/50">{lista.length} {lista.length === 1 ? "cliente" : "clientes"}</p>
      </div>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {cargando ? (
        <p className="text-sm text-marino/60">Cargando clientes...</p>
      ) : lista.length === 0 && !error ? (
        <p className="rounded-xl bg-white p-8 text-center text-sm text-marino/60">No hay clientes que coincidan.</p>
      ) : (
        <ul className="space-y-2">
          {lista.map((c) => (
            <li key={c.clave} className="overflow-hidden rounded-xl bg-white">
              <FilaCliente cliente={c} abierto={abierto === c.clave} onAlternar={() => setAbierto(abierto === c.clave ? null : c.clave)} />
              {abierto === c.clave && <FichaCliente cliente={c} onGuardado={cargar} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FilaCliente({ cliente: c, abierto, onAlternar }) {
  const wa = numeroWhatsApp(c.telefono);
  const dias = diasDesde(c.ultima);
  return (
    <div className="flex items-center gap-3 p-3 sm:p-4">
      <button type="button" onClick={onAlternar} className="min-w-0 flex-1 text-left">
        <p className="truncate font-medium">{c.nombre}</p>
        <p className="truncate text-xs text-marino/60">
          {c.compras > 0 ? (
            <>
              {c.compras} {c.compras === 1 ? "compra" : "compras"} · {formatearPrecio(c.total)} · última hace {dias} {dias === 1 ? "día" : "días"}
            </>
          ) : (
            "Sin compras registradas"
          )}
        </p>
        <p className="mt-1 flex flex-wrap gap-1 text-[10px] font-semibold">
          {Object.entries(c.tallas || {})
            .filter(([t]) => t !== "?")
            .sort((a, b) => b[1] - a[1])
            .map(([t, u]) => (
              <span key={t} className="rounded-full bg-hueso px-2 py-0.5">
                {t} ×{u}
              </span>
            ))}
          {n(c.por_cobrar) > 0 && <span className="rounded-full bg-orange-100 px-2 py-0.5 text-orange-800">Debe {formatearPrecio(c.por_cobrar)}</span>}
          {c.notas && <span className="rounded-full bg-ocre/15 px-2 py-0.5 text-ocre-oscuro">📝 nota</span>}
        </p>
      </button>
      {wa ? (
        <a
          href={`https://wa.me/${wa}`}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 rounded-full bg-[#25D366] px-3 py-2 text-xs font-semibold text-white"
          title={c.telefono}
        >
          WhatsApp
        </a>
      ) : (
        <button type="button" onClick={onAlternar} className="shrink-0 rounded-full border border-dashed border-marino/30 px-3 py-2 text-[11px] text-marino/60">
          + teléfono
        </button>
      )}
      <button type="button" onClick={onAlternar} className={`shrink-0 text-marino/40 transition ${abierto ? "rotate-180" : ""}`} aria-label="Ver ficha">
        ▾
      </button>
    </div>
  );
}

function FichaCliente({ cliente, esNuevo = false, onGuardado, onCerrar }) {
  const [datos, setDatos] = useState({
    nombre: cliente.nombre || "",
    telefono: cliente.telefono || "",
    correo: cliente.correo || "",
    ciudad: cliente.ciudad || "",
    notas: cliente.notas || "",
  });
  const [compras, setCompras] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");

  useEffect(() => {
    if (esNuevo || !cliente.compras) return setCompras([]);
    obtenerClienteNavegador()
      .rpc("historial_cliente", { p_nombre: cliente.nombre })
      .then(({ data }) => setCompras(data || []));
  }, [cliente.nombre, cliente.compras, esNuevo]);

  const cambiar = (campo, valor) => setDatos((d) => ({ ...d, [campo]: valor }));

  async function guardar(e) {
    e.preventDefault();
    if (!datos.nombre.trim()) return setMensaje("Escribe el nombre.");
    setGuardando(true);
    setMensaje("");
    const fila = {
      nombre: datos.nombre.trim(),
      telefono: datos.telefono.trim() || null,
      correo: datos.correo.trim() || null,
      ciudad: datos.ciudad.trim() || null,
      notas: datos.notas.trim() || null,
    };
    const supabase = obtenerClienteNavegador();
    // La clave se calcula del nombre en la base: así la ficha queda unida a sus compras
    const { error } = cliente.ficha
      ? await supabase.from("clientes").update(fila).eq("clave", cliente.clave)
      : await supabase.from("clientes").upsert({ clave: "-", ...fila }, { onConflict: "clave" });
    setGuardando(false);
    if (error) return setMensaje(error.message.includes("duplicate") ? "Ya existe un cliente con ese nombre." : `No se pudo guardar: ${error.message}`);
    setMensaje("Guardado ✓");
    onGuardado?.();
  }

  return (
    <div className={`border-t border-marino/10 bg-hueso/50 p-4 ${esNuevo ? "rounded-xl border-0 bg-white" : ""}`}>
      {esNuevo && <p className="etiqueta mb-3">Nuevo cliente</p>}
      <form onSubmit={guardar} className="grid gap-2 sm:grid-cols-2">
        <label className="text-xs">
          Nombre
          <input
            className="campo mt-1"
            value={datos.nombre}
            onChange={(e) => cambiar("nombre", e.target.value)}
            disabled={!esNuevo && cliente.compras > 0}
            title={!esNuevo && cliente.compras > 0 ? "El nombre viene de sus compras" : ""}
            required
          />
        </label>
        <label className="text-xs">
          Teléfono
          <input className="campo mt-1" inputMode="tel" placeholder="0991234567" value={datos.telefono} onChange={(e) => cambiar("telefono", e.target.value)} />
        </label>
        <label className="text-xs">
          Correo
          <input className="campo mt-1" type="email" value={datos.correo} onChange={(e) => cambiar("correo", e.target.value)} />
        </label>
        <label className="text-xs">
          Ciudad
          <input className="campo mt-1" value={datos.ciudad} onChange={(e) => cambiar("ciudad", e.target.value)} />
        </label>
        <label className="text-xs sm:col-span-2">
          Notas (qué le gusta, qué pidió, cuándo escribirle…)
          <textarea className="campo mt-1 min-h-[70px]" value={datos.notas} onChange={(e) => cambiar("notas", e.target.value)} />
        </label>
        <div className="flex items-center gap-3 sm:col-span-2">
          <button type="submit" disabled={guardando} className="btn-marino px-5 py-2 text-xs">
            {guardando ? "Guardando..." : "Guardar ficha"}
          </button>
          {onCerrar && (
            <button type="button" onClick={onCerrar} className="text-xs underline underline-offset-4">
              Cancelar
            </button>
          )}
          {mensaje && <span className="text-xs text-marino/70">{mensaje}</span>}
        </div>
      </form>

      {!esNuevo && cliente.compras > 0 && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="rounded-lg bg-white p-2">
              <p className="text-marino/60">Cliente desde</p>
              <p className="font-semibold">{fechaTexto(cliente.primera)}</p>
            </div>
            <div className="rounded-lg bg-white p-2">
              <p className="text-marino/60">Prendas</p>
              <p className="font-semibold">{cliente.prendas}</p>
            </div>
            <div className="rounded-lg bg-white p-2">
              <p className="text-marino/60">Promedio por compra</p>
              <p className="font-semibold">{formatearPrecio(n(cliente.total) / Math.max(1, cliente.compras))}</p>
            </div>
          </div>
          {cliente.favoritas?.length > 0 && (
            <p className="text-xs text-marino/70">
              <strong>Lo que más compra:</strong> {cliente.favoritas.join(" · ")}
            </p>
          )}
          <div>
            <p className="mb-1 text-xs font-semibold">Compras</p>
            {compras === null ? (
              <p className="text-xs text-marino/60">Cargando...</p>
            ) : (
              <ul className="divide-y divide-marino/10 rounded-lg bg-white text-xs">
                {compras.map((v, i) => {
                  const fila = (
                    <div className="flex justify-between gap-3 px-3 py-2">
                      <span className="min-w-0">
                        <span className="text-marino/50">
                          {fechaTexto(v.fecha)} · {v.origen} · {v.vendedor}
                        </span>
                        <span className="block">{v.detalle}</span>
                      </span>
                      <span className="shrink-0 text-right">
                        <strong>{formatearPrecio(v.valor)}</strong>
                        {v.estado === "por_cobrar" && <span className="block text-[10px] text-orange-700">por cobrar</span>}
                      </span>
                    </div>
                  );
                  return (
                    <li key={i}>
                      {v.pedido_id ? <Link href={`/admin/pedidos/${v.pedido_id}`} className="block hover:bg-hueso/60">{fila}</Link> : fila}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
