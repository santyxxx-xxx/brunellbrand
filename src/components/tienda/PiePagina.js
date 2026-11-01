import Link from "next/link";
import { TIENDA } from "@/config/tienda";
import Logo from "@/components/marca/Logo";

export default function PiePagina({ categorias = [] }) {
  const anio = new Date().getFullYear();
  return (
    <footer className="mt-20 bg-marino text-hueso">
      <div className="contenedor grid gap-10 py-14 sm:grid-cols-3">
        <div>
          <Logo tono="claro" tamano="lg" />
          <p className="mt-4 max-w-xs text-sm text-hueso/70">{TIENDA.descripcion}</p>
        </div>
        <div>
          <p className="etiqueta text-ocre">Tienda</p>
          <ul className="mt-4 space-y-2 text-sm text-hueso/80">
            <li><Link href="/catalogo" className="hover:text-ocre">Catálogo completo</Link></li>
            {categorias.map((c) => (
              <li key={c.id}>
                <Link href={`/catalogo?categoria=${c.slug}`} className="hover:text-ocre">{c.nombre}</Link>
              </li>
            ))}
            <li><Link href="/carrito" className="hover:text-ocre">Mi carrito</Link></li>
          </ul>
        </div>
        <div>
          <p className="etiqueta text-ocre">Contacto</p>
          <ul className="mt-4 space-y-2 text-sm text-hueso/80">
            <li>{TIENDA.ciudad}</li>
            {TIENDA.whatsapp.map((w) => (
              <li key={w.numero}>
                <a href={`https://wa.me/${w.numero}`} target="_blank" rel="noopener noreferrer" className="hover:text-ocre">
                  WhatsApp {w.etiqueta}
                </a>
              </li>
            ))}
            <li>
              <a href={TIENDA.instagram} target="_blank" rel="noopener noreferrer" className="hover:text-ocre">
                Instagram
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-hueso/10">
        <p className="contenedor py-5 text-xs text-hueso/50">
          © {anio} {TIENDA.nombre}. Todos los derechos reservados.
        </p>
      </div>
    </footer>
  );
}
