"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { obtenerClienteNavegador } from "@/lib/supabase/cliente";
import { borrarFotos, refrescarTienda, subirFoto } from "@/lib/admin";
import { aNumero, crearSlug, slugProducto } from "@/lib/utilidades";
import { TALLAS } from "@/config/tienda";

const VACIO = {
  sku: "",
  nombre: "",
  descripcion: "",
  precio: "",
  precio_anterior: "",
  categoria_id: "",
  destacado: false,
  activo: true,
  imagenes: [],
};

// Formulario para crear (sin productoId) o editar (con productoId) un producto
export default function FormularioProducto({ productoId }) {
  const router = useRouter();
  const esEdicion = Boolean(productoId);

  const [datos, setDatos] = useState(VACIO);
  const [stock, setStock] = useState(Object.fromEntries(TALLAS.map((t) => [t, 0])));
  const [categorias, setCategorias] = useState([]);
  const [fotosQuitadas, setFotosQuitadas] = useState([]);
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [cargando, setCargando] = useState(esEdicion);
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = obtenerClienteNavegador();
    (async () => {
      const { data: cats } = await supabase.from("categorias").select("id, nombre").order("orden");
      setCategorias(cats || []);

      if (esEdicion) {
        const { data, error } = await supabase
          .from("productos")
          .select("*, tallas:producto_tallas(talla, stock)")
          .eq("id", productoId)
          .maybeSingle();
        if (error || !data) {
          setError("No se encontró el producto.");
        } else {
          setDatos({
            sku: data.sku,
            nombre: data.nombre,
            descripcion: data.descripcion || "",
            precio: data.precio ?? "",
            precio_anterior: data.precio_anterior ?? "",
            categoria_id: data.categoria_id ?? "",
            destacado: data.destacado,
            activo: data.activo,
            imagenes: data.imagenes || [],
          });
          const s = Object.fromEntries(TALLAS.map((t) => [t, 0]));
          (data.tallas || []).forEach((t) => (s[t.talla] = t.stock));
          setStock(s);
        }
        setCargando(false);
      }
    })();
  }, [esEdicion, productoId]);

  function cambiar(campo, valor) {
    setDatos((d) => ({ ...d, [campo]: valor }));
  }

  async function agregarFotos(e) {
    const archivos = Array.from(e.target.files || []);
    e.target.value = "";
    if (!archivos.length) return;
    setError("");
    setSubiendo(true);
    try {
      const carpeta = crearSlug(datos.sku) || "sin-codigo";
      const urls = [];
      for (const archivo of archivos) {
        urls.push(await subirFoto(archivo, carpeta));
      }
      setDatos((d) => ({ ...d, imagenes: [...d.imagenes, ...urls] }));
    } catch (err) {
      setError(err.message);
    }
    setSubiendo(false);
  }

  function quitarFoto(url) {
    setDatos((d) => ({ ...d, imagenes: d.imagenes.filter((u) => u !== url) }));
    setFotosQuitadas((f) => [...f, url]);
  }

  function hacerPortada(indice) {
    setDatos((d) => {
      const imagenes = [...d.imagenes];
      const [foto] = imagenes.splice(indice, 1);
      return { ...d, imagenes: [foto, ...imagenes] };
    });
  }

  async function guardar(e) {
    e.preventDefault();
    setError("");

    const precio = aNumero(datos.precio);
    if (!datos.nombre.trim() || !datos.sku.trim()) return setError("El nombre y el código son obligatorios.");
    if (precio === null || precio < 0) return setError("Ingresa un precio válido.");

    setGuardando(true);
    const supabase = obtenerClienteNavegador();
    const registro = {
      sku: datos.sku.trim(),
      nombre: datos.nombre.trim(),
      slug: slugProducto(datos.nombre, datos.sku),
      descripcion: datos.descripcion.trim() || null,
      precio,
      precio_anterior: aNumero(datos.precio_anterior),
      categoria_id: datos.categoria_id ? Number(datos.categoria_id) : null,
      destacado: datos.destacado,
      activo: datos.activo,
      imagenes: datos.imagenes,
    };

    const respuesta = esEdicion
      ? await supabase.from("productos").update(registro).eq("id", productoId).select("id").single()
      : await supabase.from("productos").insert(registro).select("id").single();

    if (respuesta.error) {
      setGuardando(false);
      const duplicado = respuesta.error.code === "23505";
      return setError(duplicado ? "Ya existe un producto con ese código o nombre." : respuesta.error.message);
    }

    const id = respuesta.data.id;
    const filasStock = TALLAS.map((t) => ({
      producto_id: id,
      talla: t,
      stock: Math.max(0, parseInt(stock[t], 10) || 0),
    }));
    const { error: errorStock } = await supabase
      .from("producto_tallas")
      .upsert(filasStock, { onConflict: "producto_id,talla" });

    if (errorStock) {
      setGuardando(false);
      return setError(`Producto guardado, pero falló el stock: ${errorStock.message}`);
    }

    if (fotosQuitadas.length) await borrarFotos(fotosQuitadas);
    await refrescarTienda();
    router.push("/admin");
    router.refresh();
  }

  if (cargando) return <p className="text-sm text-marino/60">Cargando producto...</p>;

  return (
    <form onSubmit={guardar} className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-3xl">{esEdicion ? "Editar producto" : "Nuevo producto"}</h1>
        <Link href="/admin" className="text-sm underline underline-offset-4">Volver</Link>
      </div>

      <section className="grid gap-4 rounded-xl bg-white p-5 sm:grid-cols-2">
        <Campo etiqueta="Nombre *">
          <input className="campo" value={datos.nombre} onChange={(e) => cambiar("nombre", e.target.value)} placeholder="Camisa Oxford celeste" required />
        </Campo>
        <Campo etiqueta="Código (SKU) *" ayuda="Único por producto. Se usa para importar el CSV.">
          <input className="campo" value={datos.sku} onChange={(e) => cambiar("sku", e.target.value)} placeholder="BB-CAM-001" required />
        </Campo>
        <Campo etiqueta="Precio (USD) *">
          <input className="campo" inputMode="decimal" value={datos.precio} onChange={(e) => cambiar("precio", e.target.value)} placeholder="34,90" required />
        </Campo>
        <Campo etiqueta="Precio anterior (opcional)" ayuda="Si es mayor al precio, se muestra como oferta.">
          <input className="campo" inputMode="decimal" value={datos.precio_anterior} onChange={(e) => cambiar("precio_anterior", e.target.value)} placeholder="39,90" />
        </Campo>
        <Campo etiqueta="Categoría">
          <select className="campo" value={datos.categoria_id} onChange={(e) => cambiar("categoria_id", e.target.value)}>
            <option value="">Sin categoría</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>{c.nombre}</option>
            ))}
          </select>
        </Campo>
        <div className="flex flex-col justify-end gap-3 pb-1">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-ocre" checked={datos.destacado} onChange={(e) => cambiar("destacado", e.target.checked)} />
            Mostrar en destacados (inicio)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-ocre" checked={datos.activo} onChange={(e) => cambiar("activo", e.target.checked)} />
            Visible en la tienda
          </label>
        </div>
        <div className="sm:col-span-2">
          <Campo etiqueta="Descripción">
            <textarea className="campo" rows={4} value={datos.descripcion} onChange={(e) => cambiar("descripcion", e.target.value)} placeholder="Tela, corte, cuidados..." />
          </Campo>
        </div>
      </section>

      <section className="rounded-xl bg-white p-5">
        <h2 className="etiqueta mb-3">Stock por talla</h2>
        <div className="grid grid-cols-3 gap-3 sm:max-w-md">
          {TALLAS.map((t) => (
            <label key={t} className="text-center">
              <span className="mb-1 block text-sm font-semibold">{t}</span>
              <input
                type="number"
                min="0"
                inputMode="numeric"
                className="campo text-center"
                value={stock[t]}
                onChange={(e) => setStock((s) => ({ ...s, [t]: e.target.value }))}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="rounded-xl bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="etiqueta">Fotos</h2>
          <span className="text-xs text-marino/60">La primera es la portada</span>
        </div>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {datos.imagenes.map((url, i) => (
            <div key={url} className="relative">
              <div className={`aspect-[3/4] overflow-hidden rounded-lg border-2 ${i === 0 ? "border-ocre" : "border-transparent"}`}>
                <img src={url} alt="" className="h-full w-full object-cover" />
              </div>
              <div className="mt-1 flex justify-between text-[11px]">
                {i === 0 ? (
                  <span className="font-semibold text-ocre">Portada</span>
                ) : (
                  <button type="button" onClick={() => hacerPortada(i)} className="underline">Portada</button>
                )}
                <button type="button" onClick={() => quitarFoto(url)} className="text-red-700 underline">Quitar</button>
              </div>
            </div>
          ))}
          <label className={`flex aspect-[3/4] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-marino/25 text-center text-xs text-marino/60 hover:border-ocre ${subiendo ? "pointer-events-none opacity-50" : ""}`}>
            <span className="text-2xl">+</span>
            {subiendo ? "Subiendo..." : "Agregar fotos"}
            <input type="file" accept="image/*" multiple className="hidden" onChange={agregarFotos} />
          </label>
        </div>
        {!datos.sku && <p className="mt-2 text-xs text-marino/50">Consejo: escribe primero el código para ordenar las fotos en carpetas.</p>}
      </section>

      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="sticky bottom-0 -mx-4 flex gap-3 bg-hueso/95 px-4 py-4 backdrop-blur">
        <button type="submit" disabled={guardando || subiendo} className="btn-ocre flex-1 sm:flex-none">
          {guardando ? "Guardando..." : esEdicion ? "Guardar cambios" : "Crear producto"}
        </button>
        <Link href="/admin" className="btn-borde">Cancelar</Link>
      </div>
    </form>
  );
}

function Campo({ etiqueta, ayuda, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{etiqueta}</span>
      {children}
      {ayuda && <span className="mt-1 block text-xs text-marino/50">{ayuda}</span>}
    </label>
  );
}
