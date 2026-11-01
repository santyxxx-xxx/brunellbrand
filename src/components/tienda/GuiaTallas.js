"use client";

import { useState } from "react";
import { GUIA_TALLAS } from "@/config/tienda";
import { IconoCerrar, IconoRegla } from "./Iconos";

export default function GuiaTallas() {
  const [abierta, setAbierta] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierta(true)}
        className="inline-flex items-center gap-1.5 text-sm text-marino/70 underline underline-offset-4 hover:text-ocre"
      >
        <IconoRegla /> Guía de tallas
      </button>

      {abierta && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-marino/50" onClick={() => setAbierta(false)} />
          <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-6 sm:rounded-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-serif text-2xl">Guía de tallas</h2>
              <button type="button" onClick={() => setAbierta(false)} aria-label="Cerrar guía de tallas">
                <IconoCerrar />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-center text-sm">
                <thead>
                  <tr className="bg-marino text-hueso">
                    {GUIA_TALLAS.columnas.map((c) => (
                      <th key={c} className="px-3 py-2 font-medium">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {GUIA_TALLAS.filas.map((fila) => (
                    <tr key={fila[0]} className="border-b border-marino/10 even:bg-hueso">
                      {fila.map((celda, i) => (
                        <td key={i} className={`px-3 py-2 ${i === 0 ? "font-semibold" : ""}`}>{celda}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-4 text-xs text-marino/60">{GUIA_TALLAS.nota}</p>

            <h3 className="mt-6 etiqueta text-ocre">Cómo medir</h3>
            <ul className="mt-2 space-y-1.5 text-sm text-marino/80">
              {GUIA_TALLAS.comoMedir.map((t) => (
                <li key={t}>• {t}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
