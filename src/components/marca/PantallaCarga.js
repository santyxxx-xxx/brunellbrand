"use client";

import { useEffect, useState } from "react";
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

  return (
    <div
      className={`pantalla-carga fixed inset-0 z-[100] flex flex-col items-center justify-center bg-marino ${
        estado === "saliendo" ? "pantalla-carga--saliendo" : ""
      }`}
      aria-hidden="true"
    >
      <div className="grifo-brillo grifo-entrada h-36 w-32 sm:h-44 sm:w-40" />

      <img src="/marca/texto-dorado.webp" alt="" className="texto-revelar mt-7 h-7 w-auto sm:h-8" />
      <span className="linea-entrada mt-5 h-px w-24 bg-ocre/70" />
    </div>
  );
}
