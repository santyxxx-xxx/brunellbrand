import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerProductoPorSlug, obtenerRelacionados } from "@/lib/consultas";
import DetalleProducto from "@/components/tienda/DetalleProducto";
import TarjetaProducto from "@/components/tienda/TarjetaProducto";
import Revelar from "@/components/marca/Revelar";

export const revalidate = 60;

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const producto = await obtenerProductoPorSlug(slug);
  if (!producto) return { title: "Producto no encontrado" };
  return {
    title: producto.nombre,
    description: producto.descripcion?.slice(0, 150) || `${producto.nombre} en Brunel Brand`,
    openGraph: producto.imagenes?.[0] ? { images: [producto.imagenes[0]] } : undefined,
  };
}

export default async function PaginaProducto({ params }) {
  const { slug } = await params;
  const producto = await obtenerProductoPorSlug(slug);
  if (!producto) notFound();

  const relacionados = await obtenerRelacionados(producto, 4);

  return (
    <div className="contenedor pt-6">
      <nav className="mb-6 text-xs text-marino/60">
        <Link href="/" className="hover:text-ocre">Inicio</Link>
        <span className="mx-2">/</span>
        <Link href="/catalogo" className="hover:text-ocre">Catálogo</Link>
        {producto.categoria && (
          <>
            <span className="mx-2">/</span>
            <Link href={`/catalogo?categoria=${producto.categoria.slug}`} className="hover:text-ocre">
              {producto.categoria.nombre}
            </Link>
          </>
        )}
      </nav>

      <DetalleProducto producto={producto} />

      {relacionados.length > 0 && (
        <section className="mt-20">
          <h2 className="titulo-seccion">También te puede gustar</h2>
          <div className="mt-6 grid grid-cols-2 gap-x-3 gap-y-8 sm:gap-x-5 md:grid-cols-4">
            {relacionados.map((p, i) => (
              <Revelar key={p.id} retraso={(i % 4) * 80}>
                <TarjetaProducto producto={p} />
              </Revelar>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
