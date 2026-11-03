"use client";

import { useEffect, useMemo, useState } from "react";
import { obtenerClienteNavegador } from "@/lib/supabase/cliente";
import { formatearPrecio } from "@/lib/utilidades";

// Paleta categórica validada (orden fijo; el color sigue a la entidad, no al ranking)
const PALETA = ["#3B5BA5", "#B07F1F", "#7A4FB0", "#C0573A"];
const COLOR_CANAL = { web: PALETA[0], tienda: PALETA[1] };
const PERIODOS = [
  { clave: "dia", texto: "Hoy" },
  { clave: "semana", texto: "Semana" },
  { clave: "mes", texto: "Mes" },
];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const corto = (n) =>
  new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", notation: Number(n) >= 10000 ? "compact" : "standard", maximumFractionDigits: 0 }).format(Number(n) || 0);
const nombreMes = (yyyymm) => {
  const [a, m] = yyyymm.split("-");
  return `${MESES[Number(m) - 1]} ${a.slice(2)}`;
};

export default function Dashboard() {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [periodo, setPeriodo] = useState("mes");

  useEffect(() => {
    obtenerClienteNavegador()
      .rpc("dashboard_datos")
      .then(({ data, error }) => (error ? setError(error.message) : setDatos(data)));
  }, []);

  // Colores fijos por vendedor (orden alfabético, para que no cambien al filtrar)
  const colorVendedor = useMemo(() => {
    const nombres = [...new Set((datos?.vendedores || []).map((v) => v.vendedor))].sort();
    return Object.fromEntries(nombres.map((n, i) => [n, PALETA[i % PALETA.length]]));
  }, [datos]);

  if (error) return <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">{error}</p>;
  if (!datos) return <p className="text-sm text-marino/60">Cargando dashboard...</p>;

  const meses = datos.por_mes || [];
  const actual = meses[meses.length - 1] || { ventas: 0, utilidad: 0, pedidos: 0, ventas_sin_costo: 0 };
  const anterior = meses[meses.length - 2] || { ventas: 0, utilidad: 0 };
  const crecimiento = (a, b) => (Number(b) > 0 ? ((Number(a) - Number(b)) / Number(b)) * 100 : null);

  const ranking = [...(datos.vendedores || [])].sort((a, b) => b[`${periodo}_total`] - a[`${periodo}_total`]);
  const maxRanking = Math.max(1, ...ranking.map((v) => Number(v[`${periodo}_total`])));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl">Dashboard</h1>
        <p className="text-sm text-marino/60">Ventas web y en tienda · hora de Ecuador</p>
      </div>

      {/* Indicadores del mes */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador titulo="Ventas del mes" valor={formatearPrecio(actual.ventas)} cambio={crecimiento(actual.ventas, anterior.ventas)} />
        <Indicador titulo="Utilidad del mes" valor={formatearPrecio(actual.utilidad)} cambio={crecimiento(actual.utilidad, anterior.utilidad)} />
        <Indicador titulo="Ventas registradas" valor={actual.pedidos} />
        <Indicador
          titulo="Ticket promedio"
          valor={formatearPrecio(actual.pedidos ? Number(actual.ventas) / actual.pedidos : 0)}
        />
      </div>
      {Number(actual.ventas_sin_costo) > 0 && (
        <p className="-mt-3 text-xs text-marino/60">
          ⓘ {formatearPrecio(actual.ventas_sin_costo)} en ventas de este mes son de productos sin costo registrado y no suman a la utilidad.
        </p>
      )}

      {/* Ranking por vendedor */}
      <Tarjeta
        titulo="Ventas por vendedor"
        accion={
          <div className="flex rounded-full bg-hueso p-0.5 text-xs">
            {PERIODOS.map((p) => (
              <button
                key={p.clave}
                type="button"
                onClick={() => setPeriodo(p.clave)}
                className={`rounded-full px-3 py-1 ${periodo === p.clave ? "bg-marino text-white" : ""}`}
              >
                {p.texto}
              </button>
            ))}
          </div>
        }
      >
        {ranking.length === 0 ? (
          <Vacio />
        ) : (
          <ol className="space-y-3">
            {ranking.map((v, i) => {
              const total = Number(v[`${periodo}_total`]);
              return (
                <li key={v.vendedor} title={`${v.vendedor}: ${formatearPrecio(total)} en ${v[`${periodo}_ventas`]} ventas`}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2">
                      <span className="w-5 text-xs text-marino/50">{i + 1}.</span>
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorVendedor[v.vendedor] }} />
                      <span className="font-medium">{v.vendedor}</span>
                    </span>
                    <span>
                      <strong>{formatearPrecio(total)}</strong>
                      <span className="ml-1 text-xs text-marino/50">· {v[`${periodo}_ventas`]} ventas</span>
                    </span>
                  </div>
                  <div className="ml-7 mt-1.5 h-2 rounded-full bg-marino/5">
                    <div
                      className="h-2 rounded-full transition-all duration-700"
                      style={{ width: `${(total / maxRanking) * 100}%`, background: colorVendedor[v.vendedor] }}
                    />
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Tarjeta>

      {/* Ventas por día y vendedor */}
      <Tarjeta titulo="Ventas por día · últimos 14 días">
        <VentasPorDia datos={datos.por_dia || []} hoy={datos.hoy} colorVendedor={colorVendedor} />
      </Tarjeta>

      {/* Ventas y utilidad por mes */}
      <Tarjeta titulo="Ventas y utilidad por mes">
        <VentasPorMes meses={meses} />
      </Tarjeta>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Online vs tienda */}
        <Tarjeta titulo="Online vs. tienda · este mes">
          <OnlineVsTienda canales={datos.canales_mes || []} meses={meses} />
        </Tarjeta>

        {/* Más vendidos */}
        <Tarjeta titulo="Más vendidos · últimos 30 días">
          {(datos.top_productos || []).length === 0 ? (
            <Vacio />
          ) : (
            <ol className="space-y-2.5">
              {datos.top_productos.map((p, i) => {
                const max = Number(datos.top_productos[0].unidades) || 1;
                return (
                  <li key={p.sku} title={`${p.nombre}: ${p.unidades} unidades · ${formatearPrecio(p.total)}`}>
                    <div className="flex justify-between gap-2 text-sm">
                      <span className="truncate">{i + 1}. {p.nombre}</span>
                      <span className="shrink-0 font-semibold">{p.unidades} u.</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-marino/5">
                      <div className="h-1.5 rounded-full" style={{ width: `${(p.unidades / max) * 100}%`, background: PALETA[0] }} />
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </Tarjeta>
      </div>

      {/* Sin ventas */}
      <Tarjeta titulo="Con stock y sin ventas en 30 días">
        {(datos.sin_ventas || []).length === 0 ? (
          <p className="text-sm text-marino/60">Todos los productos con stock se vendieron en los últimos 30 días. 🎉</p>
        ) : (
          <ul className="divide-y divide-marino/10 text-sm">
            {datos.sin_ventas.map((p) => (
              <li key={p.sku} className="flex justify-between gap-3 py-2">
                <span className="truncate">{p.nombre} <span className="text-xs text-marino/40">{p.sku}</span></span>
                <span className="shrink-0 text-marino/70">{p.stock} en stock</span>
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>
    </div>
  );
}

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

function Indicador({ titulo, valor, cambio }) {
  return (
    <div className="rounded-2xl bg-white p-4">
      <p className="text-xs text-marino/60">{titulo}</p>
      <p className="mt-1 font-serif text-2xl sm:text-3xl">{valor}</p>
      {cambio !== undefined && (
        <p className={`mt-1 text-xs font-semibold ${cambio === null ? "text-marino/40" : cambio >= 0 ? "text-green-700" : "text-red-700"}`}>
          {cambio === null ? "Sin mes anterior para comparar" : `${cambio >= 0 ? "▲" : "▼"} ${Math.abs(cambio).toFixed(1)}% vs. mes anterior`}
        </p>
      )}
    </div>
  );
}

function Vacio() {
  return <p className="text-sm text-marino/60">Aún no hay ventas en este periodo.</p>;
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

// Barras apiladas por vendedor para cada día
function VentasPorDia({ datos, hoy, colorVendedor }) {
  const dias = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(`${hoy}T12:00:00`);
    d.setDate(d.getDate() - (13 - i));
    return d.toISOString().slice(0, 10);
  });
  const porDia = dias.map((fecha) => {
    const filas = datos.filter((d) => d.fecha === fecha);
    return { fecha, filas, total: filas.reduce((s, f) => s + Number(f.total), 0) };
  });
  const max = Math.max(1, ...porDia.map((d) => d.total));
  const vendedores = Object.keys(colorVendedor);

  if (!datos.length) return <Vacio />;
  return (
    <>
      <div className="flex h-44 items-end gap-1 border-b border-marino/15">
        {porDia.map((d) => (
          <div
            key={d.fecha}
            className="group relative flex h-full flex-1 flex-col justify-end"
            title={`${new Date(`${d.fecha}T12:00:00`).toLocaleDateString("es-EC", { weekday: "short", day: "numeric", month: "short" })}: ${formatearPrecio(d.total)}${d.filas
              .map((f) => `\n${f.vendedor}: ${formatearPrecio(f.total)}`)
              .join("")}`}
          >
            <div className="flex flex-col-reverse gap-[2px]" style={{ height: `${(d.total / max) * 100}%` }}>
              {d.filas.map((f) => (
                <div
                  key={f.vendedor}
                  className="w-full first:rounded-b-none last:rounded-t-[4px] group-hover:opacity-80"
                  style={{ flexGrow: Number(f.total), background: colorVendedor[f.vendedor] || PALETA[3] }}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1 text-[10px] text-marino/50">
        {porDia.map((d, i) => (
          <span key={d.fecha} className="flex-1 text-center">{i % 2 === 1 ? Number(d.fecha.slice(8)) : ""}</span>
        ))}
      </div>
      {vendedores.length > 1 && <Leyenda items={vendedores.map((v) => ({ texto: v, color: colorVendedor[v] }))} />}
    </>
  );
}

// Barras agrupadas: ventas y utilidad (misma escala en dólares) + % de crecimiento
function VentasPorMes({ meses }) {
  const max = Math.max(1, ...meses.map((m) => Number(m.ventas)));
  if (!meses.some((m) => Number(m.ventas) > 0)) return <Vacio />;
  return (
    <>
      <div className="overflow-x-auto">
        <div className="flex h-52 min-w-[560px] items-end gap-2 border-b border-marino/15">
          {meses.map((m, i) => {
            const previo = meses[i - 1];
            const crec = previo && Number(previo.ventas) > 0 ? ((m.ventas - previo.ventas) / previo.ventas) * 100 : null;
            return (
              <div
                key={m.mes}
                className="flex h-full flex-1 flex-col justify-end"
                title={`${nombreMes(m.mes)}\nVentas: ${formatearPrecio(m.ventas)}\nUtilidad: ${formatearPrecio(m.utilidad)}${crec === null ? "" : `\nCrecimiento: ${crec.toFixed(1)}%`}`}
              >
                {crec !== null && Number(m.ventas) > 0 && (
                  <span className={`mb-1 text-center text-[10px] font-semibold ${crec >= 0 ? "text-green-700" : "text-red-700"}`}>
                    {crec >= 0 ? "+" : ""}{crec.toFixed(0)}%
                  </span>
                )}
                <div className="flex h-[85%] items-end justify-center gap-[2px]">
                  <div className="w-1/2 max-w-4 rounded-t-[4px]" style={{ height: `${(m.ventas / max) * 100}%`, background: PALETA[0] }} />
                  <div className="w-1/2 max-w-4 rounded-t-[4px]" style={{ height: `${(Math.max(0, m.utilidad) / max) * 100}%`, background: PALETA[1] }} />
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex min-w-[560px] gap-2 text-[10px] text-marino/50">
          {meses.map((m) => <span key={m.mes} className="flex-1 text-center">{nombreMes(m.mes)}</span>)}
        </div>
      </div>
      <Leyenda items={[{ texto: "Ventas", color: PALETA[0] }, { texto: "Utilidad", color: PALETA[1] }]} />
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-marino/60">Ver tabla</summary>
        <table className="mt-2 w-full text-left">
          <thead className="text-marino/50"><tr><th>Mes</th><th className="text-right">Ventas</th><th className="text-right">Utilidad</th><th className="text-right">Web</th><th className="text-right">Tienda</th></tr></thead>
          <tbody>
            {meses.map((m) => (
              <tr key={m.mes} className="border-t border-marino/5">
                <td className="py-1">{nombreMes(m.mes)}</td>
                <td className="text-right">{corto(m.ventas)}</td>
                <td className="text-right">{corto(m.utilidad)}</td>
                <td className="text-right">{corto(m.web)}</td>
                <td className="text-right">{corto(m.tienda)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}

// Barra dividida web / tienda del mes + mini tendencia de 6 meses
function OnlineVsTienda({ canales, meses }) {
  const web = Number(canales.find((c) => c.canal === "web")?.total || 0);
  const tienda = Number(canales.find((c) => c.canal === "tienda")?.total || 0);
  const total = web + tienda;
  const ultimos = meses.slice(-6);
  const maxMes = Math.max(1, ...ultimos.map((m) => Number(m.web) + Number(m.tienda)));

  if (total === 0) return <Vacio />;
  return (
    <>
      <div className="flex h-8 gap-[2px] overflow-hidden rounded-lg">
        {web > 0 && <div style={{ width: `${(web / total) * 100}%`, background: COLOR_CANAL.web }} title={`Web: ${formatearPrecio(web)}`} />}
        {tienda > 0 && <div style={{ width: `${(tienda / total) * 100}%`, background: COLOR_CANAL.tienda }} title={`Tienda: ${formatearPrecio(tienda)}`} />}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="flex items-center gap-1.5 text-xs text-marino/60"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLOR_CANAL.web }} />Online</p>
          <p className="font-semibold">{formatearPrecio(web)} <span className="text-xs font-normal text-marino/50">({Math.round((web / total) * 100)}%)</span></p>
        </div>
        <div>
          <p className="flex items-center gap-1.5 text-xs text-marino/60"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLOR_CANAL.tienda }} />Tienda</p>
          <p className="font-semibold">{formatearPrecio(tienda)} <span className="text-xs font-normal text-marino/50">({Math.round((tienda / total) * 100)}%)</span></p>
        </div>
      </div>
      <p className="mt-5 text-xs text-marino/50">Últimos 6 meses</p>
      <div className="mt-2 flex h-20 items-end gap-2">
        {ultimos.map((m) => {
          const suma = Number(m.web) + Number(m.tienda);
          return (
            <div key={m.mes} className="flex flex-1 flex-col items-center" title={`${nombreMes(m.mes)} · Web ${formatearPrecio(m.web)} · Tienda ${formatearPrecio(m.tienda)}`}>
              <div className="flex w-full max-w-6 flex-col-reverse gap-[2px]" style={{ height: `${(suma / maxMes) * 64}px` }}>
                {Number(m.web) > 0 && <div style={{ flexGrow: Number(m.web), background: COLOR_CANAL.web }} />}
                {Number(m.tienda) > 0 && <div className="rounded-t-[4px]" style={{ flexGrow: Number(m.tienda), background: COLOR_CANAL.tienda }} />}
              </div>
              <span className="mt-1 text-[10px] text-marino/50">{nombreMes(m.mes).split(" ")[0]}</span>
            </div>
          );
        })}
      </div>
    </>
  );
}
