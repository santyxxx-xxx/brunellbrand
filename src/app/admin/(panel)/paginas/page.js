"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { obtenerClienteNavegador } from "@/lib/supabase/cliente";
import { refrescarTienda } from "@/lib/admin";
import TextoFormateado from "@/components/tienda/TextoFormateado";

// Editor de páginas legales (envíos, cambios y devoluciones, privacidad)
export default function Paginas() {
  const [paginas, setPaginas] = useState([]);
  const [activa, setActiva] = useState(null);
  const [titulo, setTitulo] = useState("");
  const [contenido, setContenido] = useState("");
  const [vista, setVista] = useState(false);
  const [mensaje, setMensaje] = useState("");

  useEffect(() => {
    obtenerClienteNavegador()
      .from("paginas")
      .select("*")
      .order("slug")
      .then(({ data }) => {
        setPaginas(data || []);
        if (data?.[0]) elegir(data[0]);
      });
  }, []);

  function elegir(p) {
    setActiva(p);
    setTitulo(p.titulo);
    setContenido(p.contenido);
    setMensaje("");
  }

  async function guardar() {
    const { error } = await obtenerClienteNavegador().from("paginas").update({ titulo, contenido }).eq("slug", activa.slug);
    if (error) return setMensaje(`Error: ${error.message}`);
    setPaginas((ps) => ps.map((p) => (p.slug === activa.slug ? { ...p, titulo, contenido } : p)));
    await refrescarTienda();
    setMensaje("Página guardada.");
  }

  const pendientes = (contenido.match(/\[[A-ZÁÉÍÓÚÑ /]+\]/g) || []).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-3xl">Páginas legales</h1>
        <p className="mt-1 text-sm text-marino/60">
          Formato: <code>## Título</code>, <code>- elemento de lista</code>, <code>**negrita**</code> y una línea en blanco entre párrafos.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {paginas.map((p) => (
          <button
            key={p.slug}
            type="button"
            onClick={() => elegir(p)}
            className={`rounded-full border px-4 py-1.5 text-sm ${activa?.slug === p.slug ? "border-marino bg-marino text-white" : "border-marino/20 bg-white"}`}
          >
            {p.titulo}
          </button>
        ))}
      </div>

      {activa && (
        <div className="space-y-3 rounded-xl bg-white p-5">
          {pendientes > 0 && (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              Hay {pendientes} dato(s) entre [CORCHETES] por completar antes de publicar.
            </p>
          )}
          <input className="campo font-semibold" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
          <div className="flex gap-2 text-xs">
            <button type="button" onClick={() => setVista(false)} className={`rounded-full px-3 py-1 ${!vista ? "bg-marino text-white" : "bg-hueso"}`}>Editar</button>
            <button type="button" onClick={() => setVista(true)} className={`rounded-full px-3 py-1 ${vista ? "bg-marino text-white" : "bg-hueso"}`}>Vista previa</button>
          </div>
          {vista ? (
            <div className="rounded-lg border border-marino/10 p-4"><TextoFormateado texto={contenido} /></div>
          ) : (
            <textarea className="campo min-h-[60vh] font-mono text-[13px]" value={contenido} onChange={(e) => setContenido(e.target.value)} />
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={guardar} className="btn-ocre">Guardar</button>
            <Link href={`/politicas/${activa.slug}`} target="_blank" className="text-sm underline underline-offset-4">Ver en la tienda</Link>
            {mensaje && <span className="text-sm">{mensaje}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
