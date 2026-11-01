"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useCarrito } from "@/context/CarritoContext";
import { arbolCategorias } from "@/lib/categorias";
import { IconoBolsa, IconoCerrar, IconoMenu, IconoUsuario } from "./Iconos";
import Logo from "@/components/marca/Logo";

function Flecha({ abierta, className = "" }) {
  return (
    <svg className={`h-3 w-3 transition-transform duration-200 ${abierta ? "rotate-180" : ""} ${className}`} viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M2.5 4.5 6 8l3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Encabezado({ categorias = [] }) {
  const arbol = arbolCategorias(categorias);
  const [menuAbierto, setMenuAbierto] = useState(false);
  const [desplegada, setDesplegada] = useState(null); // id de la categoría con menú abierto (escritorio)
  const [expandida, setExpandida] = useState(null); // id de la categoría expandida (celular)
  const [conSombra, setConSombra] = useState(false);
  const { cantidadTotal, cargado } = useCarrito();
  const ruta = usePathname();

  // Al deslizar, el encabezado se compacta y toma sombra
  useEffect(() => {
    const alDeslizar = () => setConSombra(window.scrollY > 12);
    alDeslizar();
    window.addEventListener("scroll", alDeslizar, { passive: true });
    return () => window.removeEventListener("scroll", alDeslizar);
  }, []);

  // Cierra menús al cambiar de página
  useEffect(() => {
    setMenuAbierto(false);
    setDesplegada(null);
  }, [ruta]);

  // Bloquea el scroll de la página mientras el menú del celular está abierto
  useEffect(() => {
    document.body.style.overflow = menuAbierto ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuAbierto]);

  const categoriaDesplegada = arbol.find((c) => c.id === desplegada);

  return (
    <header
      className={`sticky top-0 z-40 border-b bg-hueso/95 backdrop-blur transition-shadow duration-300 ${
        conSombra ? "border-transparent shadow-[0_8px_30px_-12px_rgba(31,42,68,0.25)]" : "border-marino/10"
      }`}
      onMouseLeave={() => setDesplegada(null)}
    >
      <div className={`contenedor flex items-center justify-between transition-all duration-300 ${conSombra ? "h-14" : "h-16"}`}>
        <button type="button" className="-ml-2 p-2 md:hidden" onClick={() => setMenuAbierto(true)} aria-label="Abrir menú">
          <IconoMenu />
        </button>

        <Link href="/" aria-label="Ir al inicio">
          <Logo tamano={conSombra ? "sm" : "md"} />
        </Link>

        {/* Menú de escritorio */}
        <nav className="hidden h-full items-stretch gap-7 md:flex">
          <EnlaceNav href="/catalogo" activo={ruta === "/catalogo" && !desplegada} onMouseEnter={() => setDesplegada(null)}>
            Catálogo
          </EnlaceNav>
          {arbol.map((c) =>
            c.hijos.length ? (
              <button
                key={c.id}
                type="button"
                onMouseEnter={() => setDesplegada(c.id)}
                onClick={() => setDesplegada((d) => (d === c.id ? null : c.id))}
                aria-expanded={desplegada === c.id}
                className={`relative flex items-center gap-1 text-sm tracking-wide transition hover:text-ocre ${desplegada === c.id ? "text-ocre" : ""}`}
              >
                {c.nombre}
                <Flecha abierta={desplegada === c.id} />
                <span className={`absolute inset-x-0 bottom-0 h-0.5 bg-ocre transition-transform duration-300 ${desplegada === c.id ? "scale-x-100" : "scale-x-0"}`} />
              </button>
            ) : (
              <EnlaceNav key={c.id} href={`/catalogo?categoria=${c.slug}`} onMouseEnter={() => setDesplegada(null)}>
                {c.nombre}
              </EnlaceNav>
            )
          )}
        </nav>

        <div className="flex items-center">
          <Link href="/cuenta" className="hidden p-2 sm:block" aria-label="Mi cuenta">
            <IconoUsuario />
          </Link>
          <Link href="/carrito" className="relative -mr-2 p-2" aria-label="Ver carrito">
            <IconoBolsa />
            {cargado && cantidadTotal > 0 && (
              <span className="absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-ocre px-1 text-[11px] font-bold text-white">
                {cantidadTotal}
              </span>
            )}
          </Link>
        </div>
      </div>

      {/* Menú desplegable de subcategorías (escritorio) */}
      <div
        className={`absolute inset-x-0 top-full hidden border-t border-marino/10 bg-white shadow-[0_24px_40px_-24px_rgba(31,42,68,0.35)] transition-all duration-300 md:block ${
          categoriaDesplegada ? "visible translate-y-0 opacity-100" : "invisible -translate-y-2 opacity-0"
        }`}
      >
        {categoriaDesplegada && (
          <div className="contenedor grid grid-cols-[220px_1fr_260px] gap-10 py-8">
            <div>
              <p className="etiqueta text-ocre">Colección</p>
              <p className="mt-2 font-serif text-3xl">{categoriaDesplegada.nombre}</p>
              <Link href={`/catalogo?categoria=${categoriaDesplegada.slug}`} className="mt-4 inline-block text-sm underline underline-offset-4 hover:text-ocre">
                Ver todo
              </Link>
            </div>
            <ul className="grid grid-cols-2 content-start gap-x-10 gap-y-1">
              {categoriaDesplegada.hijos.map((h) => (
                <li key={h.id}>
                  <Link
                    href={`/catalogo?categoria=${h.slug}`}
                    className="group flex items-center justify-between border-b border-marino/5 py-2.5 text-[15px] transition hover:text-ocre"
                  >
                    {h.nombre}
                    <span className="text-ocre opacity-0 transition group-hover:translate-x-1 group-hover:opacity-100">→</span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link href={`/catalogo?categoria=${categoriaDesplegada.slug}`} className="group relative block aspect-[4/3] overflow-hidden rounded-xl bg-marino">
              {categoriaDesplegada.imagen_url ? (
                <img src={categoriaDesplegada.imagen_url} alt="" className="h-full w-full object-cover opacity-90 transition duration-500 group-hover:scale-105" />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <img src="/marca/grifo-dorado.webp" alt="" className="h-24 w-auto opacity-80" />
                </div>
              )}
            </Link>
          </div>
        )}
      </div>

      {/* Menú del celular: se dibuja fuera del encabezado para que tenga fondo sólido y ocupe toda la pantalla */}
      {menuAbierto &&
        createPortal(
          <div className="fixed inset-0 z-[90] md:hidden" role="dialog" aria-modal="true">
            <div className="absolute inset-0 bg-marino/50" onClick={() => setMenuAbierto(false)} />
            <div
              className="menu-movil absolute inset-y-0 left-0 flex w-[85%] max-w-xs flex-col overflow-y-auto bg-hueso shadow-2xl"
              onClick={(e) => e.target.closest("a") && setMenuAbierto(false)}
            >
              <div className="flex items-center justify-between border-b border-marino/10 px-5 py-4">
                <Logo tamano="sm" />
                <button type="button" onClick={() => setMenuAbierto(false)} aria-label="Cerrar menú" className="-mr-2 p-2">
                  <IconoCerrar />
                </button>
              </div>
              <nav className="flex flex-col px-5 py-2">
                <EnlaceMovil href="/">Inicio</EnlaceMovil>
                <EnlaceMovil href="/catalogo">Catálogo</EnlaceMovil>
                {arbol.map((c) =>
                  c.hijos.length ? (
                    <div key={c.id} className="border-b border-marino/10">
                      <button
                        type="button"
                        onClick={() => setExpandida((e) => (e === c.id ? null : c.id))}
                        className="flex w-full items-center justify-between py-3.5 font-serif text-xl"
                        aria-expanded={expandida === c.id}
                      >
                        {c.nombre}
                        <Flecha abierta={expandida === c.id} className="h-4 w-4" />
                      </button>
                      <div className={`grid transition-all duration-300 ${expandida === c.id ? "grid-rows-[1fr] pb-3" : "grid-rows-[0fr]"}`}>
                        <ul className="overflow-hidden">
                          <li>
                            <Link href={`/catalogo?categoria=${c.slug}`} className="block py-2 pl-3 text-sm font-semibold text-ocre">
                              Ver todo {c.nombre.toLowerCase()}
                            </Link>
                          </li>
                          {c.hijos.map((h) => (
                            <li key={h.id}>
                              <Link href={`/catalogo?categoria=${h.slug}`} className="block border-l border-marino/15 py-2 pl-3 text-sm">
                                {h.nombre}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ) : (
                    <EnlaceMovil key={c.id} href={`/catalogo?categoria=${c.slug}`}>{c.nombre}</EnlaceMovil>
                  )
                )}
                <EnlaceMovil href="/carrito">Carrito {cantidadTotal > 0 && `(${cantidadTotal})`}</EnlaceMovil>
                <EnlaceMovil href="/cuenta">Mi cuenta</EnlaceMovil>
              </nav>
            </div>
          </div>,
          document.body
        )}
    </header>
  );
}

function EnlaceNav({ href, activo, children, onMouseEnter }) {
  return (
    <Link href={href} onMouseEnter={onMouseEnter} className={`relative flex items-center text-sm tracking-wide transition hover:text-ocre ${activo ? "text-ocre" : ""}`}>
      {children}
    </Link>
  );
}

function EnlaceMovil({ href, children }) {
  return (
    <Link href={href} className="border-b border-marino/10 py-3.5 font-serif text-xl">
      {children}
    </Link>
  );
}
