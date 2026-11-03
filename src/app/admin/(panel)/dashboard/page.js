"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { obtenerClienteNavegador } from "@/lib/supabase/cliente";
import { formatearPrecio } from "@/lib/utilidades";

// Paleta categórica validada (orden fijo; el color sigue a la entidad, no al ranking)
const PALETA = ["#3B5BA5", "#B07F1F", "#7A4FB0", "#C0573A"];
const C_VENTAS = PALETA[0];
const C_UTILIDAD = PALETA[1];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const DIAS = ["", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const NOMBRES = {
  transferencia: "Transferencia",
  payphone: "PayPhone",
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  pagado: "Pagado",
  por_cobrar: "Por cobrar",
  historico: "Historial (Treinta)",
  web: "Tienda online",
  tienda: "Tienda física",
};

const n = (v) => Number(v) || 0;
const pct = (a, b) => (n(b) > 0 ? ((n(a) - n(b)) / n(b)) * 100 : null);
const margen = (u, v) => (n(v) > 0 ? (n(u) / n(v)) * 100 : null);
const mesTexto = (yyyymm, largo = false) => {
  const [a, m] = yyyymm.split("-");
  return largo ? `${MESES[Number(m) - 1]} ${a}` : `${MESES[Number(m) - 1]} ${a.slice(2)}`;
};
const fechaTexto = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString("es-EC", { day: "numeric", month: "short", year: "2-digit" });
const iso = (d) => d.toISOString().slice(0, 10);

function rangoPreset(clave) {
  const hoy = new Date();
  const h = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 12);
  const desde = new Date(h);
  if (clave === "hoy") return { desde: iso(h), hasta: iso(h) };
  if (clave === "semana") {
    desde.setDate(h.getDate() - ((h.getDay() + 6) % 7));
    return { desde: iso(desde), hasta: iso(h) };
  }
  if (clave === "mes") return { desde: iso(new Date(h.getFullYear(), h.getMonth(), 1, 12)), hasta: iso(h) };
  if (clave === "mes_pasado") {
    return { desde: iso(new Date(h.getFullYear(), h.getMonth() - 1, 1, 12)), hasta: iso(new Date(h.getFullYear(), h.getMonth(), 0, 12)) };
  }
  if (clave === "3m") return { desde: iso(new Date(h.getFullYear(), h.getMonth() - 2, 1, 12)), hasta: iso(h) };
  if (clave === "anio") return { desde: iso(new Date(h.getFullYear(), 0, 1, 12)), hasta: iso(h) };
  return { desde: null, hasta: null }; // todo
}

const PRESETS = [
  { clave: "hoy", texto: "Hoy" },
  { clave: "semana", texto: "Semana" },
  { clave: "mes", texto: "Este mes" },
  { clave: "mes_pasado", texto: "Mes pasado" },
  { clave: "3m", texto: "3 meses" },
  { clave: "anio", texto: "Este año" },
  { clave: "todo", texto: "Todo" },
];

export default function Balance() {
  const [preset, setPreset] = useState("todo");
  const [rango, setRango] = useState({ desde: null, hasta: null });
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setCargando(true);
    obtenerClienteNavegador()
      .rpc("balance_datos", { p_desde: rango.desde, p_hasta: rango.hasta })
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else {
          setError("");
          setDatos(data);
        }
        setCargando(false);
      });
  }, [rango]);

  function elegirPreset(clave) {
    setPreset(clave);
    setRango(rangoPreset(clave));
  }

  if (error) return <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</p>;
  if (!datos) return <p className="text-sm text-marino/60">Cargando balance...</p>;

  const r = datos.resumen;
  const comp = datos.comparacion;

  return (
    <div className={`space-y-6 transition-opacity ${cargando ? "opacity-60" : ""}`}>
      <div>
        <h1 className="font-serif text-3xl">Balance</h1>
        <p className="text-sm text-marino/60">
          Historial de Treinta + ventas nuevas (web y tienda) · {fechaTexto(datos.desde)} – {fechaTexto(datos.hasta)}
        </p>
      </div>

      {/* Filtro de fechas */}
      <div className="sticky top-[6.5rem] z-10 -mx-4 space-y-2 bg-hueso/95 px-4 py-2 backdrop-blur">
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4">
          {PRESETS.map((p) => (
            <button
              key={p.clave}
              type="button"
              onClick={() => elegirPreset(p.clave)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs ${preset === p.clave ? "bg-marino text-white" : "bg-white"}`}
            >
              {p.texto}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs">
          <input
            type="date"
            className="campo w-auto py-1.5 text-xs"
            value={rango.desde || datos.desde}
            onChange={(e) => {
              setPreset("");
              setRango((x) => ({ ...x, desde: e.target.value || null }));
            }}
          />
          <span>a</span>
          <input
            type="date"
            className="campo w-auto py-1.5 text-xs"
            value={rango.hasta || datos.hasta}
            onChange={(e) => {
              setPreset("");
              setRango((x) => ({ ...x, hasta: e.target.value || null }));
            }}
          />
        </div>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Indicador titulo="Ventas" valor={formatearPrecio(r.ventas)} detalle={`${r.n} ventas`} />
        <Indicador titulo="Utilidad (valor − costo)" valor={formatearPrecio(r.utilidad)} />
        <Indicador titulo="Margen" valor={margen(r.utilidad, r.ventas_con_costo) === null ? "—" : `${margen(r.utilidad, r.ventas_con_costo).toFixed(1)}%`} />
        <Indicador titulo="Ticket promedio" valor={formatearPrecio(r.ticket)} />
        <Indicador titulo="Compras de mercadería" valor={formatearPrecio(datos.gastos.compras_mercaderia)} detalle="del historial" />
      </div>

      {/* Comparación de meses */}
      <Tarjeta titulo={`Comparación · ${mesTexto(comp.mes, true)}`}>
        <div className="grid gap-3 sm:grid-cols-3">
          <BloqueMes titulo={mesTexto(comp.mes, true)} datos={comp.actual} />
          <BloqueComparado titulo="vs. mes anterior" actual={comp.actual} base={comp.anterior} />
          {comp.hay_anio_anterior ? (
            <BloqueComparado titulo="vs. mismo mes del año anterior" actual={comp.actual} base={comp.anio_anterior} />
          ) : (
            <div className="rounded-xl bg-hueso p-3 text-xs text-marino/60">
              <p className="font-semibold text-marino">vs. mismo mes del año anterior</p>
              <p className="mt-1">El historial empieza en {fechaTexto(datos.primera_venta)}. Esta comparación aparecerá cuando haya un año de ventas.</p>
            </div>
          )}
        </div>
        <p className="mt-3 text-[11px] text-marino/50">Se compara el mes de la fecha final del filtro.</p>
      </Tarjeta>

      {/* Ganancia de cada uno */}
      {datos.ganancias && (
        <Tarjeta titulo="Ganancia de cada vendedor">
          <GananciasVendedor ganancias={datos.ganancias} mensual={datos.ganancias_mensual} aporte={datos.aporte_por_prenda} />
        </Tarjeta>
      )}

      {/* Empresa */}
      {datos.empresa && (
        <Tarjeta titulo="La empresa">
          <Empresa
            empresa={datos.empresa}
            mensual={datos.empresa_mensual}
            inventario={datos.inventario}
            aporte={datos.aporte_por_prenda}
            onGuardarAporte={async (valor) => {
              const { error } = await obtenerClienteNavegador().from("configuracion").upsert({ clave: "aporte_por_prenda", valor });
              if (!error) setRango((r) => ({ ...r }));
              return error;
            }}
          />
        </Tarjeta>
      )}

      {/* Día a día */}
      <Tarjeta titulo="Ventas y utilidad día a día">
        <LineaDiaria diario={datos.diario} desde={datos.desde} hasta={datos.hasta} />
      </Tarjeta>

      {/* Mes a mes */}
      <Tarjeta titulo="Ventas y utilidad mes a mes">
        <BarrasMensuales meses={datos.mensual} />
      </Tarjeta>

      {/* Vendedores, métodos, estado, canal */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Tarjeta titulo="Ventas por vendedor">
          <Barras filas={datos.por_vendedor} conUtilidad />
        </Tarjeta>
        <Tarjeta titulo="Por método de pago">
          <Barras filas={datos.por_metodo} />
        </Tarjeta>
        <Tarjeta titulo="Pagado vs. por cobrar">
          <Barras filas={datos.por_estado} />
          {!datos.por_estado.some((e) => e.nombre === "por_cobrar") && (
            <p className="mt-2 text-xs text-marino/50">No hay ventas por cobrar en este periodo.</p>
          )}
        </Tarjeta>
        <Tarjeta titulo="Por canal">
          <Barras filas={datos.por_canal} />
        </Tarjeta>
      </div>

      {/* Días de la semana y clientes */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Tarjeta titulo="Mejores días de la semana">
          <DiasSemana dias={datos.dias_semana} />
        </Tarjeta>
        <Tarjeta titulo="Mejores clientes">
          {datos.clientes.length === 0 ? (
            <Vacio />
          ) : (
            <ol className="divide-y divide-marino/10 text-sm">
              {datos.clientes.map((c, i) => (
                <li key={c.nombre + i} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="mr-2 text-xs text-marino/40">{i + 1}.</span>
                    {c.nombre}
                    <span className="block pl-5 text-[11px] text-marino/50">
                      {c.compras} {c.compras === 1 ? "compra" : "compras"} · última {fechaTexto(c.ultima)}
                    </span>
                  </span>
                  <strong className="shrink-0">{formatearPrecio(c.ventas)}</strong>
                </li>
              ))}
            </ol>
          )}
        </Tarjeta>
      </div>

      {/* Prendas */}
      <Tarjeta titulo="Prendas" accion={<Link href="/admin/prendas" className="text-xs underline underline-offset-4">Revisar coincidencias</Link>}>
        <TablaPrendas vendidas={datos.prendas_vendidas} rentables={datos.prendas_rentables} />
      </Tarjeta>

      <Tarjeta titulo="Más vendidas mes a mes (unidades)">
        <PrendasMensual filas={datos.prendas_mensual} />
      </Tarjeta>

      <div className="grid gap-6 lg:grid-cols-2">
        <Tarjeta titulo="Casi no se movieron">
          {datos.poco_movimiento.length === 0 ? (
            <Vacio texto="Todas las prendas visibles se vendieron más de una vez." />
          ) : (
            <ul className="divide-y divide-marino/10 text-sm">
              {datos.poco_movimiento.map((p) => (
                <li key={p.sku} className="flex justify-between gap-3 py-2">
                  <span className="min-w-0 truncate">{p.nombre}</span>
                  <span className="shrink-0 text-xs text-marino/60">
                    {p.unidades} vendidas · {p.stock} en stock
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-[11px] text-marino/50">Productos visibles del catálogo con 0 o 1 unidad vendida en el periodo.</p>
        </Tarjeta>

        {datos.reponer_pronto && (
          <Tarjeta titulo="Reponer pronto">
            {datos.reponer_pronto.length === 0 ? (
              <Vacio texto="Nada urgente: ninguna talla que se venda está por acabarse." />
            ) : (
              <ul className="divide-y divide-marino/10 text-sm">
                {datos.reponer_pronto.map((p, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate">{p.nombre} · talla {p.talla}</span>
                      <span className="text-[11px] text-marino/50">Vendiste {p.unidades_60d} en 60 días</span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${p.stock === 0 ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}>
                      {p.stock === 0 ? "Agotada" : `Quedan ${p.stock} · ~${p.dias} días`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-[11px] text-marino/50">Tallas con 3 o menos que sí se venden, ordenadas por cuándo se acaban.</p>
          </Tarjeta>
        )}

        {datos.plata_quieta && (
          <Tarjeta titulo="Plata quieta">
            <p className="font-serif text-3xl">{formatearPrecio(datos.plata_quieta.total)}</p>
            <p className="text-xs text-marino/60">
              a costo, en {datos.plata_quieta.productos} productos con stock que no se vendieron en este periodo
            </p>
            <ul className="mt-3 divide-y divide-marino/10 text-sm">
              {datos.plata_quieta.top.map((p, i) => (
                <li key={i} className="flex justify-between gap-3 py-2">
                  <span className="truncate">{p.nombre}</span>
                  <span className="shrink-0 text-xs text-marino/60">{p.stock} u. · {formatearPrecio(p.valor)}</span>
                </li>
              ))}
            </ul>
          </Tarjeta>
        )}

        <Tarjeta titulo="Compras de mercadería">
          <ComprasMensuales compras={datos.gastos.compras_mensual} />
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-marino/70">
            <p>Gastos operativos: <strong className="text-marino">{formatearPrecio(datos.gastos.operativos)}</strong></p>
            <p>Abonos a gastos: <strong className="text-marino">{formatearPrecio(datos.gastos.abonos)}</strong></p>
          </div>
        </Tarjeta>
      </div>
    </div>
  );
}

/* ------------------------------ Piezas ------------------------------ */

function Tarjeta({ titulo, accion, children }) {
  return (
    <section className="rounded-2xl bg-white p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-xl">{titulo}</h2>
        {accion}
      </div>
      {children}
    </section>
  );
}

function Indicador({ titulo, valor, detalle }) {
  return (
    <div className="rounded-2xl bg-white p-4">
      <p className="text-xs text-marino/60">{titulo}</p>
      <p className="mt-1 font-serif text-2xl sm:text-3xl">{valor}</p>
      {detalle && <p className="mt-0.5 text-[11px] text-marino/50">{detalle}</p>}
    </div>
  );
}

function Vacio({ texto = "No hay datos en este periodo." }) {
  return <p className="text-sm text-marino/60">{texto}</p>;
}

function Leyenda({ items }) {
  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-marino/70">
      {items.map((i) => (
        <span key={i.texto} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />
          {i.texto}
        </span>
      ))}
    </div>
  );
}

function Cambio({ valor }) {
  if (valor === null) return <span className="text-marino/40">sin base</span>;
  return (
    <span className={valor >= 0 ? "text-green-700" : "text-red-700"}>
      {valor >= 0 ? "▲" : "▼"} {Math.abs(valor).toFixed(1)}%
    </span>
  );
}

function BloqueMes({ titulo, datos }) {
  return (
    <div className="rounded-xl bg-hueso p-3">
      <p className="text-xs font-semibold capitalize">{titulo}</p>
      <p className="mt-1 font-serif text-2xl">{formatearPrecio(datos.ventas)}</p>
      <p className="text-xs text-marino/60">Utilidad {formatearPrecio(datos.utilidad)} · {datos.n} ventas</p>
    </div>
  );
}

function BloqueComparado({ titulo, actual, base }) {
  return (
    <div className="rounded-xl bg-hueso p-3 text-sm">
      <p className="text-xs font-semibold">{titulo}</p>
      <p className="mt-1">Ventas: <strong><Cambio valor={pct(actual.ventas, base.ventas)} /></strong></p>
      <p>Utilidad: <strong><Cambio valor={pct(actual.utilidad, base.utilidad)} /></strong></p>
      <p className="mt-1 text-[11px] text-marino/50">Antes: {formatearPrecio(base.ventas)} · {base.n} ventas</p>
    </div>
  );
}

// Línea de tiempo diaria (SVG) con cursor y detalle al tocar o pasar el mouse
function LineaDiaria({ diario, desde, hasta }) {
  const [activo, setActivo] = useState(null);
  const ref = useRef(null);
  const dias = useMemo(() => {
    const mapa = new Map(diario.map((d) => [d.fecha, d]));
    const lista = [];
    const ini = new Date(`${desde}T12:00:00`);
    const fin = new Date(`${hasta}T12:00:00`);
    for (let d = new Date(ini); d <= fin && lista.length < 800; d.setDate(d.getDate() + 1)) {
      const f = iso(d);
      lista.push({ fecha: f, ventas: n(mapa.get(f)?.ventas), utilidad: n(mapa.get(f)?.utilidad), n: n(mapa.get(f)?.n) });
    }
    return lista;
  }, [diario, desde, hasta]);

  if (!diario.length) return <Vacio />;
  const W = 600, H = 180, P = 4;
  const max = Math.max(1, ...dias.map((d) => d.ventas));
  const x = (i) => P + (i * (W - 2 * P)) / Math.max(1, dias.length - 1);
  const y = (v) => H - P - (v / max) * (H - 2 * P);
  const linea = (campo) => dias.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d[campo]).toFixed(1)}`).join("");
  const area = `${linea("ventas")}L${x(dias.length - 1)},${H - P}L${x(0)},${H - P}Z`;

  function mover(e) {
    const caja = ref.current.getBoundingClientRect();
    const rel = (e.clientX - caja.left) / caja.width;
    setActivo(Math.max(0, Math.min(dias.length - 1, Math.round(rel * (dias.length - 1)))));
  }

  const d = activo !== null ? dias[activo] : null;
  return (
    <div>
      <div className="mb-2 h-10 text-sm">
        {d ? (
          <p>
            <strong>{fechaTexto(d.fecha)}</strong> · Ventas {formatearPrecio(d.ventas)} · Utilidad {formatearPrecio(d.utilidad)} · {d.n} ventas
          </p>
        ) : (
          <p className="text-xs text-marino/50">Toca o pasa el cursor sobre el gráfico para ver cada día. Máximo diario: {formatearPrecio(max)}.</p>
        )}
      </div>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="h-48 w-full touch-none select-none"
        preserveAspectRatio="none"
        onPointerMove={mover}
        onPointerDown={mover}
        onPointerLeave={() => setActivo(null)}
      >
        <line x1={P} x2={W - P} y1={H - P} y2={H - P} stroke="#1F2A44" strokeOpacity="0.15" />
        <path d={area} fill={C_VENTAS} fillOpacity="0.12" />
        <path d={linea("ventas")} fill="none" stroke={C_VENTAS} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        <path d={linea("utilidad")} fill="none" stroke={C_UTILIDAD} strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {d && <line x1={x(activo)} x2={x(activo)} y1={0} y2={H} stroke="#1F2A44" strokeOpacity="0.35" vectorEffect="non-scaling-stroke" />}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-marino/50">
        <span>{fechaTexto(dias[0].fecha)}</span>
        <span>{fechaTexto(dias[dias.length - 1].fecha)}</span>
      </div>
      <Leyenda items={[{ texto: "Ventas", color: C_VENTAS }, { texto: "Utilidad", color: C_UTILIDAD }]} />
    </div>
  );
}

function BarrasMensuales({ meses }) {
  if (!meses.length) return <Vacio />;
  const max = Math.max(1, ...meses.map((m) => n(m.ventas)));
  return (
    <>
      <div className="overflow-x-auto">
        <div className="flex h-56 items-end gap-2 border-b border-marino/15" style={{ minWidth: Math.max(300, meses.length * 48) }}>
          {meses.map((m, i) => {
            const crec = i > 0 ? pct(m.ventas, meses[i - 1].ventas) : null;
            return (
              <div
                key={m.mes}
                className="flex h-full flex-1 flex-col justify-end"
                title={`${mesTexto(m.mes, true)}\nVentas: ${formatearPrecio(m.ventas)}\nUtilidad: ${formatearPrecio(m.utilidad)}\nVentas: ${m.n}${crec === null ? "" : `\nCrecimiento: ${crec.toFixed(1)}%`}`}
              >
                <span className={`mb-1 h-4 text-center text-[10px] font-semibold ${crec === null ? "" : crec >= 0 ? "text-green-700" : "text-red-700"}`}>
                  {crec === null ? "" : `${crec >= 0 ? "+" : ""}${crec.toFixed(0)}%`}
                </span>
                <div className="flex h-[85%] items-end justify-center gap-[2px]">
                  <div className="w-1/2 max-w-5 rounded-t-[4px]" style={{ height: `${(n(m.ventas) / max) * 100}%`, background: C_VENTAS }} />
                  <div className="w-1/2 max-w-5 rounded-t-[4px]" style={{ height: `${(Math.max(0, n(m.utilidad)) / max) * 100}%`, background: C_UTILIDAD }} />
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex gap-2 text-[10px] text-marino/50" style={{ minWidth: Math.max(300, meses.length * 48) }}>
          {meses.map((m) => <span key={m.mes} className="flex-1 text-center">{mesTexto(m.mes)}</span>)}
        </div>
      </div>
      <Leyenda items={[{ texto: "Ventas", color: C_VENTAS }, { texto: "Utilidad", color: C_UTILIDAD }]} />
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-marino/60">Ver tabla</summary>
        <table className="mt-2 w-full text-left">
          <thead className="text-marino/50">
            <tr><th>Mes</th><th className="text-right">Ventas</th><th className="text-right">Utilidad</th><th className="text-right">Margen</th><th className="text-right">vs. ant.</th></tr>
          </thead>
          <tbody>
            {meses.map((m, i) => {
              const mg = margen(m.utilidad, m.ventas);
              const crec = i > 0 ? pct(m.ventas, meses[i - 1].ventas) : null;
              return (
                <tr key={m.mes} className="border-t border-marino/5">
                  <td className="py-1 capitalize">{mesTexto(m.mes, true)}</td>
                  <td className="text-right">{formatearPrecio(m.ventas)}</td>
                  <td className="text-right">{formatearPrecio(m.utilidad)}</td>
                  <td className="text-right">{mg === null ? "—" : `${mg.toFixed(0)}%`}</td>
                  <td className="text-right"><Cambio valor={crec} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </details>
    </>
  );
}

function Barras({ filas, conUtilidad = false }) {
  if (!filas.length) return <Vacio />;
  const max = Math.max(1, ...filas.map((f) => n(f.ventas)));
  const total = filas.reduce((s, f) => s + n(f.ventas), 0);
  return (
    <ul className="space-y-3">
      {filas.map((f) => (
        <li key={f.nombre} title={`${NOMBRES[f.nombre] || f.nombre}: ${formatearPrecio(f.ventas)} · ${f.n} ventas`}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="font-medium">{NOMBRES[f.nombre] || f.nombre}</span>
            <span>
              <strong>{formatearPrecio(f.ventas)}</strong>
              <span className="ml-1 text-xs text-marino/50">· {Math.round((n(f.ventas) / total) * 100)}% · {f.n} ventas</span>
            </span>
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-marino/5">
            <div className="h-2 rounded-full" style={{ width: `${(n(f.ventas) / max) * 100}%`, background: C_VENTAS }} />
          </div>
          {conUtilidad && f.utilidad !== null && (
            <p className="mt-1 text-[11px] text-marino/60">
              Utilidad {formatearPrecio(f.utilidad)} · margen {margen(f.utilidad, f.ventas)?.toFixed(0) ?? "—"}% · ticket {formatearPrecio(n(f.ventas) / Math.max(1, f.n))}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

function DiasSemana({ dias }) {
  if (!dias.length) return <Vacio />;
  const porDia = Object.fromEntries(dias.map((d) => [d.dia, d]));
  const lista = [1, 2, 3, 4, 5, 6, 7].map((d) => ({ dia: d, ventas: n(porDia[d]?.ventas), n: n(porDia[d]?.n) }));
  const max = Math.max(1, ...lista.map((d) => d.ventas));
  const mejor = lista.reduce((a, b) => (b.ventas > a.ventas ? b : a));
  return (
    <>
      <div className="flex h-40 items-end gap-2 border-b border-marino/15">
        {lista.map((d) => (
          <div key={d.dia} className="flex h-full flex-1 flex-col justify-end" title={`${DIAS[d.dia]}: ${formatearPrecio(d.ventas)} · ${d.n} ventas`}>
            <div className="rounded-t-[4px]" style={{ height: `${(d.ventas / max) * 100}%`, background: d.dia === mejor.dia ? C_UTILIDAD : C_VENTAS }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-2 text-[10px] text-marino/50">
        {lista.map((d) => <span key={d.dia} className="flex-1 text-center">{DIAS[d.dia].slice(0, 3)}</span>)}
      </div>
      <p className="mt-3 text-sm">
        Mejor día: <strong>{DIAS[mejor.dia]}</strong> · {formatearPrecio(mejor.ventas)} en {mejor.n} ventas
      </p>
    </>
  );
}

function TablaPrendas({ vendidas, rentables }) {
  const [vista, setVista] = useState("vendidas");
  const filas = vista === "vendidas" ? vendidas : rentables;
  return (
    <>
      <div className="mb-3 flex rounded-full bg-hueso p-0.5 text-xs sm:w-fit">
        {[["vendidas", "Más vendidas"], ["rentables", "Más rentables"]].map(([k, t]) => (
          <button key={k} type="button" onClick={() => setVista(k)} className={`flex-1 rounded-full px-4 py-1.5 ${vista === k ? "bg-marino text-white" : ""}`}>
            {t}
          </button>
        ))}
      </div>
      {filas.length === 0 ? (
        <Vacio />
      ) : (
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="text-xs text-marino/50">
              <tr>
                <th className="py-1">Prenda</th>
                <th className="text-right">Unid.</th>
                <th className="text-right">Ventas*</th>
                <th className="text-right">Utilidad*</th>
                <th className="text-right">Margen*</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((p, i) => {
                const mg = margen(p.utilidad, p.ventas);
                return (
                  <tr key={p.prenda_id} className="border-t border-marino/5">
                    <td className="py-2 pr-2">
                      <span className="mr-1 text-xs text-marino/40">{i + 1}.</span>
                      {p.nombre}
                      {String(p.prenda_id).startsWith("h:") && <span className="ml-1 text-[10px] text-marino/40">(solo historial)</span>}
                    </td>
                    <td className="text-right font-semibold">{p.unidades}</td>
                    <td className="text-right">{p.ventas === null ? "—" : formatearPrecio(p.ventas)}</td>
                    <td className="text-right">{p.utilidad === null ? "—" : formatearPrecio(p.utilidad)}</td>
                    <td className="text-right">{mg === null ? "—" : `${mg.toFixed(0)}%`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-marino/50">
        * Treinta guarda el valor por venta, no por prenda. Ventas, utilidad y margen por prenda incluyen solo los datos exactos:
        las ventas del historial con una sola prenda y todas las ventas nuevas del panel. Las unidades sí incluyen todo.
      </p>
    </>
  );
}

function PrendasMensual({ filas }) {
  if (!filas.length) return <Vacio />;
  const meses = [...new Set(filas.map((f) => f.mes))].sort();
  const prendas = [...new Map(filas.map((f) => [f.prenda_id, f.nombre])).entries()];
  const valor = (id, mes) => n(filas.find((f) => f.prenda_id === id && f.mes === mes)?.unidades);
  const max = Math.max(1, ...filas.map((f) => n(f.unidades)));
  return (
    <div className="-mx-5 overflow-x-auto px-5">
      <table className="w-full text-xs" style={{ minWidth: 200 + meses.length * 44 }}>
        <thead className="text-marino/50">
          <tr>
            <th className="py-1 text-left font-normal">Prenda</th>
            {meses.map((m) => <th key={m} className="font-normal">{mesTexto(m)}</th>)}
          </tr>
        </thead>
        <tbody>
          {prendas.map(([id, nombre]) => (
            <tr key={id} className="border-t border-marino/5">
              <td className="max-w-[180px] truncate py-1.5 pr-2">{nombre}</td>
              {meses.map((m) => {
                const v = valor(id, m);
                return (
                  <td key={m} className="p-0.5 text-center">
                    <span
                      className="block rounded py-1"
                      style={{ background: v ? `rgba(59, 91, 165, ${0.12 + (v / max) * 0.7})` : "transparent", color: v / max > 0.55 ? "#fff" : "#1F2A44" }}
                    >
                      {v || "·"}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ComprasMensuales({ compras }) {
  if (!compras.length) return <Vacio texto="No hay compras registradas en este periodo." />;
  const max = Math.max(1, ...compras.map((c) => n(c.total)));
  return (
    <ul className="space-y-2">
      {compras.map((c) => (
        <li key={c.mes} className="flex items-center gap-3 text-xs" title={`${mesTexto(c.mes, true)}: ${formatearPrecio(c.total)}`}>
          <span className="w-12 shrink-0 text-marino/60">{mesTexto(c.mes)}</span>
          <div className="h-2 flex-1 rounded-full bg-marino/5">
            <div className="h-2 rounded-full" style={{ width: `${(n(c.total) / max) * 100}%`, background: PALETA[2] }} />
          </div>
          <span className="w-20 shrink-0 text-right font-semibold">{formatearPrecio(c.total)}</span>
        </li>
      ))}
    </ul>
  );
}

function GananciasVendedor({ ganancias, mensual, aporte }) {
  if (!ganancias.length) return <Vacio />;
  const meses = [...new Set(mensual.map((m) => m.mes))].sort().reverse();
  const nombres = ganancias.map((g) => g.nombre);
  const valor = (mes, nombre) => mensual.find((m) => m.mes === mes && m.nombre === nombre);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {ganancias.map((g) => (
          <div key={g.nombre} className="rounded-xl bg-hueso p-4">
            <p className="text-xs font-semibold">{NOMBRES[g.nombre] || g.nombre}</p>
            <p className="mt-1 font-serif text-3xl">{formatearPrecio(g.ganancia)}</p>
            <p className="text-[11px] text-marino/60">ganancia en el periodo</p>
            <div className="mt-3 space-y-0.5 text-xs">
              <div className="flex justify-between"><span>Ventas ({g.n})</span><span>{formatearPrecio(g.ventas)}</span></div>
              <div className="flex justify-between"><span>− Costo de las prendas</span><span>{formatearPrecio(g.costo)}</span></div>
              <div className="flex justify-between"><span>− Aporte ({g.prendas} prendas × {formatearPrecio(aporte)})</span><span>{formatearPrecio(g.aporte)}</span></div>
            </div>
            {g.sin_costo > 0 && <p className="mt-2 text-[11px] text-red-700">{g.sin_costo} ventas sin costo no se incluyen en la ganancia.</p>}
          </div>
        ))}
      </div>
      {meses.length > 1 && (
        <div className="-mx-5 mt-4 overflow-x-auto px-5">
          <table className="w-full min-w-[320px] text-sm">
            <thead className="text-xs text-marino/50">
              <tr>
                <th className="py-1 text-left font-normal">Mes</th>
                {nombres.map((n) => <th key={n} className="text-right font-normal">{NOMBRES[n] || n}</th>)}
              </tr>
            </thead>
            <tbody>
              {meses.map((m) => (
                <tr key={m} className="border-t border-marino/5">
                  <td className="py-1.5 capitalize">{mesTexto(m, true)}</td>
                  {nombres.map((n) => {
                    const v = valor(m, n);
                    return (
                      <td key={n} className="text-right">
                        {v ? <><strong>{formatearPrecio(v.ganancia)}</strong><span className="block text-[10px] text-marino/50">{v.prendas} prendas</span></> : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-[11px] text-marino/50">
        Ganancia = lo que pagó el cliente (sin envío) − costo de las prendas − aporte de {formatearPrecio(aporte)} por prenda a la empresa.
      </p>
    </>
  );
}

function Empresa({ empresa, mensual, inventario, aporte, onGuardarAporte }) {
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(String(aporte));
  const [mensaje, setMensaje] = useState("");
  const recibido = n(empresa.costo_devuelto) + n(empresa.aportes);
  const saldo = n(empresa.saldo);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl bg-hueso p-3">
          <p className="text-xs text-marino/60">Recibió de las ventas</p>
          <p className="font-serif text-2xl">{formatearPrecio(recibido)}</p>
          <p className="text-[11px] text-marino/50">costo {formatearPrecio(empresa.costo_devuelto)} + aportes {formatearPrecio(empresa.aportes)}</p>
        </div>
        <div className="rounded-xl bg-hueso p-3">
          <p className="text-xs text-marino/60">Cuesta reponer lo vendido</p>
          <p className="font-serif text-2xl">{formatearPrecio(empresa.reposicion)}</p>
          <p className="text-[11px] text-marino/50">{empresa.prendas} prendas a costo de reposición</p>
        </div>
        <div className="rounded-xl bg-hueso p-3">
          <p className="text-xs text-marino/60">Resultado de la empresa</p>
          <p className={`font-serif text-2xl ${saldo < 0 ? "text-red-700" : "text-green-700"}`}>{formatearPrecio(saldo)}</p>
          <p className="text-[11px] text-marino/50">{saldo >= 0 ? "gana: el inventario puede crecer" : "pierde: reponer cuesta más de lo que entra"}</p>
        </div>
        <div className="rounded-xl bg-hueso p-3">
          <p className="text-xs text-marino/60">Inventario hoy</p>
          <p className="font-serif text-2xl">{formatearPrecio(inventario.a_costo)}</p>
          <p className="text-[11px] text-marino/50">
            {inventario.prendas} prendas · a reposición {formatearPrecio(inventario.a_reposicion)}
          </p>
        </div>
      </div>

      {mensual.length > 0 && (
        <div className="-mx-5 mt-4 overflow-x-auto px-5">
          <table className="w-full min-w-[460px] text-right text-xs">
            <thead className="text-marino/50">
              <tr><th className="py-1 text-left font-normal">Mes</th><th className="font-normal">Costo devuelto</th><th className="font-normal">Aportes</th><th className="font-normal">Compras</th><th className="font-normal">Resultado</th></tr>
            </thead>
            <tbody>
              {[...mensual].reverse().map((m) => (
                <tr key={m.mes} className="border-t border-marino/5">
                  <td className="py-1.5 text-left capitalize">{mesTexto(m.mes, true)}</td>
                  <td>{formatearPrecio(m.costo_devuelto)}</td>
                  <td>{formatearPrecio(m.aportes)}</td>
                  <td>{formatearPrecio(m.compras)}</td>
                  <td className={n(m.saldo) < 0 ? "text-red-700" : ""}>{formatearPrecio(m.saldo)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-marino/50">
        Resultado = costo devuelto + aportes − lo que cuesta hoy reponer esas prendas. Los aportes son lo que hace crecer el inventario.
        “Compras” son las compras de mercadería registradas en Treinta.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span>Aporte por prenda: <strong>{formatearPrecio(aporte)}</strong></span>
        {editando ? (
          <>
            <input className="campo w-20 py-1" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
            <button
              type="button"
              className="rounded-full bg-marino px-3 py-1 text-white"
              onClick={async () => {
                const num = Number(String(valor).replace(",", "."));
                if (!Number.isFinite(num) || num < 0) return setMensaje("Valor inválido");
                const error = await onGuardarAporte(num);
                setMensaje(error ? error.message : "Guardado. Aplica a las ventas nuevas.");
                setEditando(false);
              }}
            >
              Guardar
            </button>
          </>
        ) : (
          <button type="button" className="underline" onClick={() => setEditando(true)}>Cambiar</button>
        )}
        {mensaje && <span className="text-marino/60">{mensaje}</span>}
      </div>
    </>
  );
}
