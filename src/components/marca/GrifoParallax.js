"use client";

import { useEffect, useRef } from "react";

// Grifo grande del banner: entra con brillo y se desplaza suavemente al deslizar (parallax).
export default function GrifoParallax({ className = "" }) {
  const ref = useRef(null);

  useEffect(() => {
    const elemento = ref.current;
    if (!elemento || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let cuadro = 0;
    function mover() {
      cuadro = 0;
      const y = Math.min(window.scrollY, 900);
      elemento.style.transform = `translate3d(0, ${y * 0.25}px, 0) rotate(${y * -0.01}deg)`;
      elemento.style.opacity = String(Math.max(0, 1 - y / 700));
    }
    function alDeslizar() {
      if (!cuadro) cuadro = requestAnimationFrame(mover);
    }
    window.addEventListener("scroll", alDeslizar, { passive: true });
    return () => {
      window.removeEventListener("scroll", alDeslizar);
      if (cuadro) cancelAnimationFrame(cuadro);
    };
  }, []);

  return (
    <div ref={ref} className={`pointer-events-none will-change-transform ${className}`} aria-hidden="true">
      <div className="grifo-brillo grifo-flotar h-full w-full" />
    </div>
  );
}
