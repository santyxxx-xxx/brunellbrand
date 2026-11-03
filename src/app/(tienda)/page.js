import Link from "next/link";
import { BANNER } from "@/config/tienda";
import { obtenerCategorias, obtenerDestacados } from "@/lib/consultas";
import TarjetaProducto from "@/components/tienda/TarjetaProducto";
import { IconoFlecha } from "@/components/tienda/Iconos";
import Revelar from "@/components/marca/Revelar";
import GrifoParallax from "@/components/marca/GrifoParallax";
import FranjaConfianza from "@/components/tienda/FranjaConfianza";

// Los datos se actualizan cada 60 segundos
export const revalidate = 60;

export default async function Inicio() {
  const [todas, destacados] = await Promise.all([obtenerCategorias(), obtenerDestacados(8)]);
  const categorias = todas.filter((c) => !c.parent_id);

  return (
    <>
      {/* Banner principal */}
      <section className="relative overflow-hidden bg-marino text-hueso">
        {BANNER.imagen && (
          <img
            src={BANNER.imagen}
            alt=""
            className="absolute inset-0 h-full w-full object-cover opacity-40"
          />
        )}
        {/* Grifo dorado con parallax al deslizar */}
        <div className="absolute -right-10 top-6 h-64 w-56 opacity-35 sm:right-0 sm:h-80 sm:w-72 lg:right-[6%] lg:top-1/2 lg:h-[28rem] lg:w-[25rem] lg:-translate-y-1/2 lg:opacity-95">
          <GrifoParallax className="h-full w-full" />
        </div>
        <div className="contenedor banner-entrada relative flex min-h-[70vh] flex-col justify-end py-16 sm:min-h-[60vh] sm:justify-center">
          <p className="etiqueta text-ocre">{BANNER.antetitulo}</p>
          <h1 className="mt-4 max-w-2xl font-serif text-5xl font-medium leading-[1.05] sm:text-6xl lg:text-7xl">
            {BANNER.titulo}
          </h1>
          <p className="mt-5 max-w-md text-base text-hueso/75">{BANNER.texto}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/catalogo" className="btn-ocre">
              {BANNER.boton} <IconoFlecha />
            </Link>
          </div>
        </div>
      </section>

      {/* Franja de confianza */}
      <section className="contenedor -mt-6 relative z-10">
        <Revelar>
          <FranjaConfianza />
        </Revelar>
      </section>

      {/* Categorías */}
      {categorias.length > 0 && (
        <section className="contenedor pt-16">
          <Revelar className="flex items-end justify-between">
            <h2 className="titulo-seccion">Categorías</h2>
            <Link href="/catalogo" className="text-sm underline underline-offset-4 hover:text-ocre">
              Ver todo
            </Link>
          </Revelar>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
            {categorias.map((c, i) => (
              <Revelar key={c.id} retraso={(i % 4) * 90}>
              <Link
                href={`/catalogo?categoria=${c.slug}`}
                className="group relative flex aspect-[4/5] items-end overflow-hidden rounded-xl bg-marino p-4 text-hueso"
              >
                {c.imagen_url && (
                  <img
                    src={c.imagen_url}
                    alt={c.nombre}
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover opacity-70 transition duration-500 group-hover:scale-105"
                  />
                )}
                <div className="absolute inset-0 bg-linear-to-t from-marino/80 to-transparent" />
                <div className="relative">
                  <p className="font-serif text-2xl">{c.nombre}</p>
                  <span className="mt-1 inline-flex items-center gap-1 text-xs text-ocre">
                    Explorar <IconoFlecha className="h-3 w-3" />
                  </span>
                </div>
              </Link>
              </Revelar>
            ))}
          </div>
        </section>
      )}

      {/* Destacados */}
      <section className="contenedor pt-16">
        <Revelar className="flex items-end justify-between">
          <div>
            <p className="etiqueta text-ocre">Selección Brunel</p>
            <h2 className="titulo-seccion mt-1">Destacados</h2>
          </div>
          <Link href="/catalogo" className="text-sm underline underline-offset-4 hover:text-ocre">
            Ver catálogo
          </Link>
        </Revelar>
        {destacados.length > 0 ? (
          <div className="mt-6 grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-5 md:grid-cols-4">
            {destacados.map((p, i) => (
              <Revelar key={p.id} retraso={(i % 4) * 90}>
                <TarjetaProducto producto={p} />
              </Revelar>
            ))}
          </div>
        ) : (
          <p className="mt-6 rounded-xl bg-white p-8 text-center text-sm text-marino/60">
            Muy pronto tendremos productos disponibles.
          </p>
        )}
      </section>

    </>
  );
}
