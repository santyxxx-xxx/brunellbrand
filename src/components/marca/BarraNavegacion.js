"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// Barra dorada arriba de la pantalla: aparece en el mismo instante del clic en un link
// y termina cuando la nueva página ya está. Así nunca parece que el clic "no entró".
function Barra() {
  const ruta = usePathname();
  const parametros = useSearchParams();
  const [ancho, setAncho] = useState(0);
  const [visible, setVisible] = useState(false);
  const temporizador = useRef(null);

  // Termina al cambiar de página
  useEffect(() => {
    clearInterval(temporizador.current);
    setAncho((a) => (a > 0 ? 100 : 0));
    const t = setTimeout(() => {
      setVisible(false);
      setAncho(0);
    }, 250);
    return () => clearTimeout(t);
  }, [ruta, parametros]);

  useEffect(() => {
    function alHacerClic(e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const enlace = e.target.closest?.("a[href]");
      if (!enlace || enlace.target === "_blank" || enlace.hasAttribute("download")) return;
      const destino = new URL(enlace.href, window.location.href);
      if (destino.origin !== window.location.origin) return;
      if (destino.pathname === window.location.pathname && destino.search === window.location.search) return;
      clearInterval(temporizador.current);
      setVisible(true);
      setAncho(12);
      // Avanza cada vez más lento hasta que llegue la página
      temporizador.current = setInterval(() => setAncho((a) => (a < 90 ? a + (90 - a) * 0.12 : a)), 200);
    }
    document.addEventListener("click", alHacerClic, true);
    return () => {
      document.removeEventListener("click", alHacerClic, true);
      clearInterval(temporizador.current);
    };
  }, []);

  if (!visible) return null;
  return <div className="barra-navegacion" style={{ width: `${ancho}%`, opacity: ancho >= 100 ? 0 : 1 }} aria-hidden="true" />;
}

export default function BarraNavegacion() {
  return (
    <Suspense fallback={null}>
      <Barra />
    </Suspense>
  );
}
