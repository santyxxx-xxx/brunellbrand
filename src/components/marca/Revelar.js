"use client";

import { useEffect, useRef, useState } from "react";

// Aparece suavemente (sube y se desvanece) cuando entra en pantalla al deslizar.
export default function Revelar({ children, retraso = 0, className = "", como: Etiqueta = "div" }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const elemento = ref.current;
    if (!elemento) return;
    if (!("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }
    const observador = new IntersectionObserver(
      ([entrada]) => {
        if (entrada.isIntersecting) {
          setVisible(true);
          observador.disconnect();
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);

  return (
    <Etiqueta
      ref={ref}
      className={`revelar ${visible ? "revelar--visible" : ""} ${className}`}
      style={{ transitionDelay: visible ? `${retraso}ms` : "0ms" }}
    >
      {children}
    </Etiqueta>
  );
}
