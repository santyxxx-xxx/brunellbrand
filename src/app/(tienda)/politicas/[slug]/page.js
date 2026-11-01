import Link from "next/link";
import { notFound } from "next/navigation";
import { obtenerClientePublico } from "@/lib/supabase/publico";
import { PAGINAS_LEGALES } from "@/config/envios";
import TextoFormateado from "@/components/tienda/TextoFormateado";

export const revalidate = 300;

async function obtenerPagina(slug) {
  const supabase = obtenerClientePublico();
  if (!supabase) return null;
  const { data } = await supabase.from("paginas").select("slug, titulo, contenido, actualizado_en").eq("slug", slug).maybeSingle();
  return data;
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const pagina = await obtenerPagina(slug);
  return { title: pagina?.titulo || "Políticas" };
}

export default async function PaginaLegal({ params }) {
  const { slug } = await params;
  const pagina = await obtenerPagina(slug);
  if (!pagina) notFound();

  return (
    <div className="contenedor max-w-3xl pt-10">
      <nav className="mb-6 flex flex-wrap gap-2">
        {PAGINAS_LEGALES.map((p) => (
          <Link
            key={p.slug}
            href={`/politicas/${p.slug}`}
            className={`rounded-full border px-4 py-1.5 text-xs transition ${
              p.slug === slug ? "border-marino bg-marino text-white" : "border-marino/20 bg-white hover:border-marino"
            }`}
          >
            {p.titulo}
          </Link>
        ))}
      </nav>
      <article className="rounded-2xl bg-white p-6 sm:p-10">
        <h1 className="titulo-seccion">{pagina.titulo}</h1>
        <p className="mt-1 text-xs text-marino/50">
          Última actualización: {new Date(pagina.actualizado_en).toLocaleDateString("es-EC", { dateStyle: "long" })}
        </p>
        <div className="mt-6">
          <TextoFormateado texto={pagina.contenido} />
        </div>
      </article>
    </div>
  );
}
