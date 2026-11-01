"use client";

import { useState } from "react";
import { TIENDA } from "@/config/tienda";
import { enlaceWhatsApp } from "@/lib/utilidades";
import { IconoCerrar, IconoInstagram, IconoWhatsApp } from "./Iconos";

// Botones fijos de Instagram y WhatsApp (con selector entre los 2 números)
export default function BotonesFlotantes() {
  const [abierto, setAbierto] = useState(false);
  const unSoloNumero = TIENDA.whatsapp.length === 1;
  const mensaje = "¡Hola Brunel Brand! Quisiera más información.";

  return (
    <div className="fixed bottom-5 right-4 z-40 flex flex-col items-end gap-3">
      {abierto && !unSoloNumero && (
        <div className="mb-1 w-64 overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-marino/10">
          <p className="bg-marino px-4 py-3 text-sm text-hueso">¿Con quién deseas hablar?</p>
          {TIENDA.whatsapp.map((w) => (
            <a
              key={w.numero}
              href={enlaceWhatsApp(w.numero, mensaje)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 border-b border-marino/5 px-4 py-3 text-sm transition last:border-0 hover:bg-hueso"
            >
              <IconoWhatsApp className="h-5 w-5 text-ocre" />
              {w.etiqueta}
            </a>
          ))}
        </div>
      )}

      <a
        href={TIENDA.instagram}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Instagram de Brunel Brand"
        className="flex h-12 w-12 items-center justify-center rounded-full bg-marino text-hueso shadow-lg transition hover:scale-105"
      >
        <IconoInstagram />
      </a>

      {unSoloNumero ? (
        <a
          href={enlaceWhatsApp(TIENDA.whatsapp[0].numero, mensaje)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Escríbenos por WhatsApp"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-ocre text-white shadow-lg transition hover:scale-105"
        >
          <IconoWhatsApp className="h-7 w-7" />
        </a>
      ) : (
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-label="Escríbenos por WhatsApp"
        aria-expanded={abierto}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-ocre text-white shadow-lg transition hover:scale-105"
      >
        {abierto ? <IconoCerrar /> : <IconoWhatsApp className="h-7 w-7" />}
      </button>
      )}
    </div>
  );
}
