"use client";

import { useRouter } from "next/navigation";

// Selector de orden del catálogo (por defecto: de la prenda más cara a la más barata)
export const ORDENES = [
  { valor: "", texto: "Precio: mayor a menor" },
  { valor: "precio-asc", texto: "Precio: menor a mayor" },
  { valor: "recientes", texto: "Más recientes" },
];

export default function SelectorOrden({ actual = "", parametros = {} }) {
  const router = useRouter();

  function cambiar(e) {
    const params = new URLSearchParams();
    Object.entries({ ...parametros, orden: e.target.value }).forEach(([k, v]) => v && params.set(k, v));
    const texto = params.toString();
    router.push(texto ? `/catalogo?${texto}` : "/catalogo", { scroll: false });
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="etiqueta text-marino/60">Ordenar</span>
      <select value={actual} onChange={cambiar} className="campo w-auto py-2 pr-8">
        {ORDENES.map((o) => (
          <option key={o.valor} value={o.valor}>{o.texto}</option>
        ))}
      </select>
    </label>
  );
}
