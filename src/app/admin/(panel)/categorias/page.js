"use client";

import { useEffect, useState } from "react";
import { obtenerClienteNavegador } from "@/lib/supabase/cliente";
import { refrescarTienda, subirFoto } from "@/lib/admin";
import { crearSlug } from "@/lib/utilidades";

export default function Categorias() {
  const [categorias, setCategorias] = useState([]);
  const [nueva, setNueva] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function cargar() {
    const { data, error } = await obtenerClienteNavegador()
      .from("categorias")
      .select("id, nombre, slug, orden, imagen_url")
      .order("orden")
      .order("nombre");
    if (error) setMensaje(error.message);
    setCategorias(data || []);
  }

  useEffect(() => {
    cargar();
  }, []);

  async function crear(e) {
    e.preventDefault();
    const nombre = nueva.trim();
    if (!nombre) return;
    setOcupado(true);
    const { error } = await obtenerClienteNavegador()
      .from("categorias")
      .insert({ nombre, slug: crearSlug(nombre), orden: categorias.length + 1 });
    setOcupado(false);
    if (error) return setMensaje(error.code === "23505" ? "Esa categoría ya existe." : error.message);
    setNueva("");
    setMensaje(`Categoría "${nombre}" creada.`);
    await cargar();
    refrescarTienda();
  }

  async function actualizar(id, cambios) {
    const { error } = await obtenerClienteNavegador().from("categorias").update(cambios).eq("id", id);
    if (error) return setMensaje(error.message);
    setMensaje("Cambios guardados.");
    await cargar();
    refrescarTienda();
  }

  async function renombrar(c) {
    const nombre = prompt("Nuevo nombre de la categoría:", c.nombre);
    if (!nombre || nombre.trim() === c.nombre) return;
    await actualizar(c.id, { nombre: nombre.trim(), slug: crearSlug(nombre) });
  }

  async function cambiarFoto(c, e) {
    const archivo = e.target.files?.[0];
    e.target.value = "";
    if (!archivo) return;
    setOcupado(true);
    try {
      const url = await subirFoto(archivo, "categorias");
      await actualizar(c.id, { imagen_url: url });
    } catch (err) {
      setMensaje(err.message);
    }
    setOcupado(false);
  }

  async function eliminar(c) {
    if (!confirm(`¿Eliminar la categoría "${c.nombre}"? Sus productos quedarán sin categoría.`)) return;
    const { error } = await obtenerClienteNavegador().from("categorias").delete().eq("id", c.id);
    if (error) return setMensaje(error.message);
    setMensaje(`Categoría "${c.nombre}" eliminada.`);
    await cargar();
    refrescarTienda();
  }

  return (
    <div>
      <h1 className="font-serif text-3xl">Categorías</h1>

      <form onSubmit={crear} className="mt-6 flex gap-2">
        <input className="campo" placeholder="Nueva categoría (ej: Pantalones)" value={nueva} onChange={(e) => setNueva(e.target.value)} />
        <button type="submit" disabled={ocupado} className="btn-ocre shrink-0">Agregar</button>
      </form>

      {mensaje && <p className="mt-4 rounded-lg bg-white p-3 text-sm">{mensaje}</p>}

      <ul className="mt-6 divide-y divide-marino/10 overflow-hidden rounded-xl bg-white">
        {categorias.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 p-4">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-hueso-oscuro">
              {c.imagen_url && <img src={c.imagen_url} alt="" className="h-full w-full object-cover" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{c.nombre}</p>
              <p className="text-xs text-marino/60">/{c.slug}</p>
            </div>
            <label className="flex items-center gap-1 text-xs">
              Orden
              <input
                type="number"
                className="campo w-16 py-1.5"
                defaultValue={c.orden}
                onBlur={(e) => Number(e.target.value) !== c.orden && actualizar(c.id, { orden: Number(e.target.value) || 0 })}
              />
            </label>
            <div className="flex gap-2 text-xs">
              <label className="cursor-pointer rounded-full border border-marino/20 px-3 py-1.5 hover:border-marino">
                Foto
                <input type="file" accept="image/*" className="hidden" onChange={(e) => cambiarFoto(c, e)} />
              </label>
              <button type="button" onClick={() => renombrar(c)} className="rounded-full border border-marino/20 px-3 py-1.5 hover:border-marino">
                Renombrar
              </button>
              <button type="button" onClick={() => eliminar(c)} className="rounded-full border border-red-200 px-3 py-1.5 text-red-700 hover:bg-red-50">
                Borrar
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
