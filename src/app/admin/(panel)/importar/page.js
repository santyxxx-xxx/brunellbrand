"use client";

import { useState } from "react";
import Papa from "papaparse";
import { obtenerClienteNavegador } from "@/lib/supabase/cliente";
import { refrescarTienda } from "@/lib/admin";
import { crearSlug, enLotes, procesarFilas } from "@/lib/importarCsv";
import { formatearPrecio } from "@/lib/utilidades";
import { TALLAS } from "@/config/tienda";

export default function ImportarCsv() {
  const [archivo, setArchivo] = useState("");
  const [resultado, setResultado] = useState(null); // { productos, errores, categorias }
  const [progreso, setProgreso] = useState("");
  const [importando, setImportando] = useState(false);
  const [terminado, setTerminado] = useState(null);

  function leerArchivo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setArchivo(file.name);
    setTerminado(null);
    setProgreso("");
    Papa.parse(file, {
      header: true,
      skipEmptyLines: "greedy",
      // detecta "," o ";" automáticamente (Excel en español suele usar ";")
      complete: (res) => setResultado(procesarFilas(res.data)),
      error: (err) => setResultado({ productos: [], errores: [`No se pudo leer el archivo: ${err.message}`], categorias: [] }),
    });
  }

  async function importar() {
    if (!resultado?.productos.length) return;
    setImportando(true);
    setTerminado(null);
    const supabase = obtenerClienteNavegador();

    try {
      // 1. Categorías: crea las que no existan
      setProgreso("Revisando categorías...");
      const { data: existentes, error: errCat } = await supabase.from("categorias").select("id, nombre, slug");
      if (errCat) throw errCat;
      const porSlug = new Map((existentes || []).map((c) => [c.slug, c.id]));
      const nuevas = resultado.categorias
        .filter((n) => !porSlug.has(crearSlug(n)))
        .map((n, i) => ({ nombre: n, slug: crearSlug(n), orden: (existentes?.length || 0) + i + 1 }));
      // evita duplicados como "Polos" y "polos" dentro del mismo archivo
      const nuevasUnicas = [...new Map(nuevas.map((c) => [c.slug, c])).values()];
      if (nuevasUnicas.length) {
        const { data: creadas, error } = await supabase.from("categorias").insert(nuevasUnicas).select("id, slug");
        if (error) throw error;
        creadas.forEach((c) => porSlug.set(c.slug, c.id));
      }

      // 2. Productos existentes (para no borrar fotos/descripción si el CSV las trae vacías)
      setProgreso("Revisando productos existentes...");
      const { data: actuales, error: errAct } = await supabase.from("productos").select("sku, descripcion, imagenes");
      if (errAct) throw errAct;
      const actualesPorSku = new Map((actuales || []).map((p) => [p.sku, p]));

      // 3. Guarda productos por lotes (crea o actualiza según el código)
      let guardados = 0;
      const idsPorSku = new Map();
      for (const lote of enLotes(resultado.productos, 50)) {
        const registros = lote.map((p) => {
          const anterior = actualesPorSku.get(p.sku);
          return {
            sku: p.sku,
            nombre: p.nombre,
            slug: p.slug,
            descripcion: p.descripcion ?? anterior?.descripcion ?? null,
            precio: p.precio,
            precio_anterior: p.precio_anterior,
            categoria_id: p.categoria ? porSlug.get(crearSlug(p.categoria)) ?? null : null,
            destacado: p.destacado,
            activo: p.activo,
            imagenes: p.imagenes.length ? p.imagenes : anterior?.imagenes || [],
          };
        });
        const { data, error } = await supabase
          .from("productos")
          .upsert(registros, { onConflict: "sku" })
          .select("id, sku");
        if (error) throw error;
        data.forEach((p) => idsPorSku.set(p.sku, p.id));
        guardados += data.length;
        setProgreso(`Guardando productos... ${guardados} de ${resultado.productos.length}`);
      }

      // 4. Stock por talla
      setProgreso("Actualizando stock...");
      const filasStock = resultado.productos.flatMap((p) =>
        TALLAS.map((t) => ({ producto_id: idsPorSku.get(p.sku), talla: t, stock: p.stock[t] }))
      ).filter((f) => f.producto_id);
      for (const lote of enLotes(filasStock, 200)) {
        const { error } = await supabase.from("producto_tallas").upsert(lote, { onConflict: "producto_id,talla" });
        if (error) throw error;
      }

      await refrescarTienda();
      setTerminado({ ok: true, texto: `¡Listo! Se importaron ${guardados} productos.` });
    } catch (err) {
      const duplicado = err?.code === "23505";
      setTerminado({
        ok: false,
        texto: duplicado
          ? "Dos productos generan la misma URL (mismo nombre y código). Revisa los duplicados."
          : `Error al importar: ${err?.message || err}`,
      });
    }
    setProgreso("");
    setImportando(false);
  }

  const vistaPrevia = resultado?.productos.slice(0, 10) || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl">Importar inventario (CSV)</h1>
        <p className="mt-2 max-w-2xl text-sm text-marino/70">
          Sube un archivo CSV con tus productos. Si un código (SKU) ya existe, el producto se <strong>actualiza</strong>;
          si no existe, se <strong>crea</strong>. Puedes exportarlo desde Excel o Google Sheets como “CSV”.
        </p>
        <a href="/plantilla-inventario.csv" download className="mt-3 inline-block text-sm text-ocre underline underline-offset-4">
          Descargar plantilla de ejemplo
        </a>
      </div>

      <div className="rounded-xl bg-white p-5 text-sm">
        <p className="etiqueta mb-2">Columnas</p>
        <ul className="grid gap-1 text-marino/80 sm:grid-cols-2">
          <li><strong>sku</strong> — código único (obligatorio)</li>
          <li><strong>nombre</strong> — obligatorio</li>
          <li><strong>precio</strong> — ej: 34.90 o 34,90 (obligatorio)</li>
          <li><strong>categoria</strong> — se crea si no existe</li>
          <li><strong>stock_s, stock_m, stock_l, stock_xl</strong> — unidades por talla</li>
          <li><strong>precio_anterior</strong> — opcional, para ofertas</li>
          <li><strong>descripcion</strong> — opcional</li>
          <li><strong>destacado</strong> / <strong>activo</strong> — si / no</li>
          <li className="sm:col-span-2"><strong>imagenes</strong> — URLs separadas por “|” (opcional; las fotos también se pueden subir después desde el panel)</li>
        </ul>
      </div>

      <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-marino/25 bg-white p-8 text-center hover:border-ocre">
        <span className="font-medium">{archivo || "Elegir archivo CSV"}</span>
        <span className="mt-1 text-xs text-marino/60">Toca aquí para seleccionar</span>
        <input type="file" accept=".csv,text/csv" className="hidden" onChange={leerArchivo} />
      </label>

      {resultado && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="rounded-full bg-white px-4 py-2"><strong>{resultado.productos.length}</strong> productos válidos</span>
            <span className="rounded-full bg-white px-4 py-2"><strong>{resultado.categorias.length}</strong> categorías</span>
            {resultado.errores.length > 0 && (
              <span className="rounded-full bg-red-50 px-4 py-2 text-red-700"><strong>{resultado.errores.length}</strong> filas con errores</span>
            )}
          </div>

          {resultado.errores.length > 0 && (
            <details className="rounded-xl bg-red-50 p-4 text-sm text-red-800" open={resultado.errores.length <= 5}>
              <summary className="cursor-pointer font-medium">Filas que no se importarán</summary>
              <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                {resultado.errores.map((e) => <li key={e}>{e}</li>)}
              </ul>
            </details>
          )}

          {vistaPrevia.length > 0 && (
            <div className="overflow-x-auto rounded-xl bg-white">
              <table className="w-full text-left text-xs">
                <thead className="bg-marino text-hueso">
                  <tr>
                    <th className="px-3 py-2">SKU</th>
                    <th className="px-3 py-2">Nombre</th>
                    <th className="px-3 py-2">Categoría</th>
                    <th className="px-3 py-2">Precio</th>
                    {TALLAS.map((t) => <th key={t} className="px-3 py-2">{t}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {vistaPrevia.map((p) => (
                    <tr key={p.sku} className="border-b border-marino/5">
                      <td className="px-3 py-2">{p.sku}</td>
                      <td className="px-3 py-2">{p.nombre}</td>
                      <td className="px-3 py-2">{p.categoria || "—"}</td>
                      <td className="px-3 py-2">{formatearPrecio(p.precio)}</td>
                      {TALLAS.map((t) => <td key={t} className="px-3 py-2">{p.stock[t]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
              {resultado.productos.length > 10 && (
                <p className="p-3 text-xs text-marino/60">Mostrando 10 de {resultado.productos.length}.</p>
              )}
            </div>
          )}

          <button type="button" onClick={importar} disabled={importando || resultado.productos.length === 0} className="btn-ocre w-full sm:w-auto">
            {importando ? "Importando..." : `Importar ${resultado.productos.length} productos`}
          </button>
          {progreso && <p className="text-sm text-marino/70">{progreso}</p>}
          {terminado && (
            <p className={`rounded-lg p-3 text-sm ${terminado.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
              {terminado.texto}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
