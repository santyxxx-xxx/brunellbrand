import Link from "next/link";
import { TALLAS } from "@/config/tienda";
import { obtenerCategorias, obtenerProductos } from "@/lib/consultas";
import TarjetaProducto from "@/components/tienda/TarjetaProducto";
import Revelar from "@/components/marca/Revelar";
import SelectorOrden from "@/components/catalogo/SelectorOrden";
import FranjaConfianza from "@/components/tienda/FranjaConfianza";
import { arbolCategorias, categoriaPrincipal } from "@/lib/categorias";

export const revalidate = 60;

export const metadata = {
  title: "Catálogo",
};


// Arma la URL conservando los filtros actuales
function construirUrl(actual, cambios) {
  const params = new URLSearchParams();
  const combinado = { ...actual, ...cambios };
  Object.entries(combinado).forEach(([clave, valor]) => {
    if (valor) params.set(clave, valor);
  });
  const texto = params.toString();
  return texto ? `/catalogo?${texto}` : "/catalogo";
}

function Chip({ href, activo, children }) {
  return (
    <Link
      href={href}
      scroll={false}
      className={`shrink-0 rounded-full border px-4 py-2 text-sm transition ${
        activo ? "border-marino bg-marino text-white" : "border-marino/20 bg-white hover:border-marino"
      }`}
    >
      {children}
    </Link>
  );
}

function SubChip({ href, activo, children }) {
  return (
    <Link
      href={href}
      scroll={false}
      className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs transition ${
        activo ? "bg-ocre text-white" : "bg-hueso-oscuro text-marino hover:bg-ocre/20"
      }`}
    >
      {children}
    </Link>
  );
}

export default async function Catalogo({ searchParams }) {
  const params = await searchParams;
  const filtros = {
    categoria: typeof params?.categoria === "string" ? params.categoria : "",
    talla: typeof params?.talla === "string" && TALLAS.includes(params.talla) ? params.talla : "",
    orden: ["precio-asc", "recientes"].includes(params?.orden) ? params.orden : "",
  };

  const [categorias, productos] = await Promise.all([
    obtenerCategorias(),
    obtenerProductos(filtros),
  ]);

  const categoriaActual = categorias.find((c) => c.slug === filtros.categoria);
  const arbol = arbolCategorias(categorias);
  const principal = categoriaPrincipal(categorias, filtros.categoria);
  const subcategorias = principal ? arbol.find((c) => c.id === principal.id)?.hijos || [] : [];

  return (
    <div className="contenedor pt-10">
      <p className="etiqueta text-ocre">
        {principal && principal.id !== categoriaActual?.id ? `Catálogo · ${principal.nombre}` : "Catálogo"}
      </p>
      <h1 className="titulo-seccion mt-1">{categoriaActual ? categoriaActual.nombre : "Todos los productos"}</h1>

      <div className="mt-5">
        <FranjaConfianza compacta />
      </div>

      {/* Filtros */}
      <div className="mt-6 space-y-4">
        <div>
          <p className="etiqueta mb-2 text-marino/60">Categoría</p>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            <Chip href={construirUrl(filtros, { categoria: "" })} activo={!filtros.categoria}>
              Todas
            </Chip>
            {arbol.map((c) => (
              <Chip key={c.id} href={construirUrl(filtros, { categoria: c.slug })} activo={principal?.id === c.id}>
                {c.nombre}
              </Chip>
            ))}
          </div>
          {subcategorias.length > 0 && (
            <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
              <SubChip href={construirUrl(filtros, { categoria: principal.slug })} activo={filtros.categoria === principal.slug}>
                Todas
              </SubChip>
              {subcategorias.map((h) => (
                <SubChip key={h.id} href={construirUrl(filtros, { categoria: h.slug })} activo={filtros.categoria === h.slug}>
                  {h.nombre}
                </SubChip>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="etiqueta mb-2 text-marino/60">Talla</p>
            <div className="flex gap-2">
              <Chip href={construirUrl(filtros, { talla: "" })} activo={!filtros.talla}>
                Todas
              </Chip>
              {TALLAS.map((t) => (
                <Chip key={t} href={construirUrl(filtros, { talla: t })} activo={filtros.talla === t}>
                  {t}
                </Chip>
              ))}
            </div>
          </div>

          <SelectorOrden actual={filtros.orden} parametros={{ categoria: filtros.categoria, talla: filtros.talla }} />
        </div>
      </div>

      <p className="mt-8 text-sm text-marino/60">
        {productos.length} {productos.length === 1 ? "producto" : "productos"}
      </p>

      {productos.length > 0 ? (
        <div className="mt-4 grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-5 md:grid-cols-3 lg:grid-cols-4">
          {productos.map((p, i) => (
            <Revelar key={p.id} retraso={(i % 4) * 80}>
              <TarjetaProducto producto={p} />
            </Revelar>
          ))}
        </div>
      ) : (
        <div className="mt-4 rounded-xl bg-white p-10 text-center">
          <p className="font-serif text-2xl">No encontramos productos</p>
          <p className="mt-2 text-sm text-marino/60">Prueba con otra talla o categoría.</p>
          <Link href="/catalogo" className="btn-borde mt-6">
            Ver todo el catálogo
          </Link>
        </div>
      )}
    </div>
  );
}
