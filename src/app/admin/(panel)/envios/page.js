"use client";

import { useEffect, useState } from "react";
import { obtenerClienteNavegador } from "@/lib/supabase/cliente";
import { refrescarTienda } from "@/lib/admin";
import { METODOS_ENVIO } from "@/config/envios";
import { aNumero } from "@/lib/utilidades";

// Costos de envío editables: zona local (domicilio / Uber) y Servientrega por provincia
export default function Envios() {
  const [tarifas, setTarifas] = useState([]);
  const [cambios, setCambios] = useState({});
  const [mensaje, setMensaje] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function cargar() {
    const { data, error } = await obtenerClienteNavegador()
      .from("tarifas_envio")
      .select("*")
      .order("es_local", { ascending: false })
      .order("orden");
    if (error) setMensaje(error.message);
    setTarifas(data || []);
    setCambios({});
  }

  useEffect(() => {
    cargar();
  }, []);

  function editar(id, campo, valor) {
    setCambios((c) => ({ ...c, [id]: { ...c[id], [campo]: valor } }));
  }
  const valor = (t, campo) => (cambios[t.id]?.[campo] !== undefined ? cambios[t.id][campo] : t[campo]);

  async function guardar() {
    setGuardando(true);
    setMensaje("");
    const supabase = obtenerClienteNavegador();
    for (const [id, c] of Object.entries(cambios)) {
      const datos = { ...c };
      if (datos.costo !== undefined) {
        const n = aNumero(datos.costo);
        if (n === null || n < 0) {
          setGuardando(false);
          return setMensaje("Hay un costo inválido. Usa números como 3.50");
        }
        datos.costo = n;
      }
      const { error } = await supabase.from("tarifas_envio").update(datos).eq("id", Number(id));
      if (error) {
        setGuardando(false);
        return setMensaje(`Error: ${error.message}`);
      }
    }
    await cargar();
    await refrescarTienda();
    setGuardando(false);
    setMensaje("Costos de envío guardados.");
  }

  const locales = tarifas.filter((t) => t.es_local);
  const provincias = tarifas.filter((t) => !t.es_local);
  const hayCambios = Object.keys(cambios).length > 0;

  const fila = (t, editableNombre = false) => (
    <li key={t.id} className="flex flex-wrap items-center gap-3 p-3">
      <div className="min-w-0 flex-1">
        {editableNombre ? (
          <>
            <input className="campo py-1.5" value={valor(t, "nombre")} onChange={(e) => editar(t.id, "nombre", e.target.value)} />
            <input className="campo mt-1 py-1.5 text-xs" value={valor(t, "descripcion") || ""} onChange={(e) => editar(t.id, "descripcion", e.target.value)} placeholder="Descripción" />
          </>
        ) : (
          <>
            <p className="text-sm font-medium">{t.provincia}</p>
            <p className="text-xs text-marino/60">{METODOS_ENVIO[t.metodo]}</p>
          </>
        )}
      </div>
      <label className="flex items-center gap-1 text-sm">
        $
        <input className="campo w-24 py-1.5 text-right" inputMode="decimal" value={valor(t, "costo")} onChange={(e) => editar(t.id, "costo", e.target.value)} />
      </label>
      <label className="flex items-center gap-1.5 text-xs">
        <input type="checkbox" className="h-4 w-4 accent-ocre" checked={valor(t, "activo")} onChange={(e) => editar(t.id, "activo", e.target.checked)} />
        Activo
      </label>
    </li>
  );

  return (
    <div className="space-y-6 pb-20">
      <div>
        <h1 className="font-serif text-3xl">Costos de envío</h1>
        <p className="mt-1 text-sm text-marino/60">Los cambios se aplican de inmediato en el checkout. Desactiva una opción para ocultarla.</p>
      </div>

      {mensaje && <p className="rounded-lg bg-white p-3 text-sm">{mensaje}</p>}

      <section>
        <h2 className="etiqueta mb-2">Zona local · Cumbayá hasta El Portal / San Luis Shopping</h2>
        <ul className="divide-y divide-marino/10 rounded-xl bg-white">
          {locales.map((t) => fila(t, true))}
        </ul>
      </section>

      <section>
        <h2 className="etiqueta mb-2">Servientrega por provincia</h2>
        <ul className="divide-y divide-marino/10 rounded-xl bg-white">
          {provincias.map((t) => fila(t))}
        </ul>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-marino/10 bg-hueso/95 p-4 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-end gap-3">
          {hayCambios && <span className="text-xs text-marino/60">Tienes cambios sin guardar</span>}
          <button type="button" onClick={guardar} disabled={!hayCambios || guardando} className="btn-ocre">
            {guardando ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}
