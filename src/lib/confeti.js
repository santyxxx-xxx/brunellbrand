"use client";

// Confeti liviano con los colores de la marca (sin librerías externas)
export function lanzarConfeti({ duracion = 2600, cantidad = 160 } = {}) {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const lienzo = document.createElement("canvas");
  Object.assign(lienzo.style, { position: "fixed", inset: "0", width: "100%", height: "100%", pointerEvents: "none", zIndex: "200" });
  document.body.appendChild(lienzo);
  const ctx = lienzo.getContext("2d");
  const escala = window.devicePixelRatio || 1;
  const ajustar = () => {
    lienzo.width = window.innerWidth * escala;
    lienzo.height = window.innerHeight * escala;
    ctx.setTransform(escala, 0, 0, escala, 0, 0);
  };
  ajustar();

  const colores = ["#C99A2E", "#E8C978", "#1F2A44", "#F5F1E8", "#FFFFFF", "#A97F1F"];
  const ancho = window.innerWidth;
  const piezas = Array.from({ length: cantidad }, (_, i) => {
    const desdeIzquierda = i % 2 === 0;
    return {
      x: desdeIzquierda ? -10 : ancho + 10,
      y: window.innerHeight * (0.55 + Math.random() * 0.3),
      vx: (desdeIzquierda ? 1 : -1) * (4 + Math.random() * 7),
      vy: -(9 + Math.random() * 9),
      giro: Math.random() * Math.PI,
      vgiro: (Math.random() - 0.5) * 0.35,
      w: 6 + Math.random() * 6,
      h: 8 + Math.random() * 8,
      color: colores[i % colores.length],
    };
  });

  const inicio = performance.now();
  function cuadro(ahora) {
    const t = ahora - inicio;
    ctx.clearRect(0, 0, lienzo.width, lienzo.height);
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, t - duracion * 0.65) / (duracion * 0.35));
    for (const p of piezas) {
      p.vy += 0.32;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.giro += p.vgiro;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.giro);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.giro)));
      ctx.restore();
    }
    if (t < duracion) requestAnimationFrame(cuadro);
    else lienzo.remove();
  }
  requestAnimationFrame(cuadro);
}
