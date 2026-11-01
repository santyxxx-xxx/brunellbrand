"use client";

import { useEffect, useState } from "react";
import { TIENDA } from "@/config/tienda";
import { CLAVE_INTRO } from "@/lib/intro";

const DURACION = 2600; // ms que dura la presentación completa

// Pantalla de presentación con el grifo: se muestra una sola vez por visita.
// Un script en el layout oculta esta pantalla antes de pintar si ya se vio (clase "sin-intro").
export default function PantallaCarga() {
  const [estado, setEstado] = useState("visible"); // visible | saliendo | oculta

  useEffect(() => {
    // La clase "sin-intro" la pone el script del layout antes de pintar si ya se vio en esta visita
    const yaVista = document.documentElement.classList.contains("sin-intro");
    try {
      sessionStorage.setItem(CLAVE_INTRO, "1");
    } catch {
      /* sin almacenamiento: se mostrará en cada recarga */
    }
    if (yaVista) {
      setEstado("oculta");
      return;
    }
    const reducir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const total = reducir ? 600 : DURACION;
    const t1 = setTimeout(() => setEstado("saliendo"), total);
    const t2 = setTimeout(() => setEstado("oculta"), total + 900);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  if (estado === "oculta") return null;

  const letras = TIENDA.marca.split("");

  return (
    <div
      className={`pantalla-carga fixed inset-0 z-[100] flex flex-col items-center justify-center bg-marino ${
        estado === "saliendo" ? "pantalla-carga--saliendo" : ""
      }`}
      aria-hidden="true"
    >
      <div className="grifo-brillo grifo-entrada h-36 w-32 sm:h-44 sm:w-40" />

      <p className="mt-6 flex pl-[0.3em] font-serif text-3xl font-medium tracking-[0.3em] text-ocre sm:text-4xl">
        {letras.map((letra, i) => (
          <span key={i} className="letra-entrada" style={{ animationDelay: `${700 + i * 90}ms` }}>
            {letra}
          </span>
        ))}
      </p>
      <span className="linea-entrada mt-4 h-px w-24 bg-ocre/70" />
      <p className="texto-entrada mt-3 pl-[0.6em] text-[10px] font-semibold tracking-[0.6em] text-hueso/60">BRAND</p>
    </div>
  );
}
