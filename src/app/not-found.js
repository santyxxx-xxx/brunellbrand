import Link from "next/link";

export default function NoEncontrado() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-hueso px-6 text-center">
      <p className="etiqueta text-ocre">Error 404</p>
      <h1 className="mt-2 font-serif text-4xl">Esta página no existe</h1>
      <p className="mt-2 text-sm text-marino/60">Puede que el producto ya no esté disponible.</p>
      <Link href="/catalogo" className="btn-ocre mt-6">
        Ir al catálogo
      </Link>
    </div>
  );
}
