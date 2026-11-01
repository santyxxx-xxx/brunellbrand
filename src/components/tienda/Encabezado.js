"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useCarrito } from "@/context/CarritoContext";
import { IconoBolsa, IconoCerrar, IconoMenu, IconoUsuario } from "./Iconos";
import Logo from "@/components/marca/Logo";

export default function Encabezado({ categorias = [] }) {
  const ENLACES = [
    { href: "/", texto: "Inicio" },
    { href: "/catalogo", texto: "Catálogo" },
    ...categorias.slice(0, 3).map((c) => ({ href: `/catalogo?categoria=${c.slug}`, texto: c.nombre })),
  ];
  const [menuAbierto, setMenuAbierto] = useState(false);
  const { cantidadTotal, cargado } = useCarrito();
  const ruta = usePathname();
  const [conSombra, setConSombra] = useState(false);

  // Al deslizar, el encabezado se compacta y toma sombra
  useEffect(() => {
    const alDeslizar = () => setConSombra(window.scrollY > 12);
    alDeslizar();
    window.addEventListener("scroll", alDeslizar, { passive: true });
    return () => window.removeEventListener("scroll", alDeslizar);
  }, []);

  return (
    <header className={`sticky top-0 z-40 border-b bg-hueso/95 backdrop-blur transition-shadow duration-300 ${conSombra ? "border-transparent shadow-[0_8px_30px_-12px_rgba(31,42,68,0.25)]" : "border-marino/10"}`}>
      <div className={`contenedor flex items-center justify-between transition-all duration-300 ${conSombra ? "h-14" : "h-16"}`}>
        <button
          type="button"
          className="-ml-2 p-2 md:hidden"
          onClick={() => setMenuAbierto(true)}
          aria-label="Abrir menú"
        >
          <IconoMenu />
        </button>

        <Link href="/" aria-label="Ir al inicio">
          <Logo tamano={conSombra ? "sm" : "md"} />
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          {ENLACES.map((e) => (
            <Link
              key={e.href}
              href={e.href}
              className={`text-sm tracking-wide transition hover:text-ocre ${
                ruta === e.href ? "text-ocre" : ""
              }`}
            >
              {e.texto}
            </Link>
          ))}
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

      {/* Menú móvil */}
      {menuAbierto && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-marino/40" onClick={() => setMenuAbierto(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 flex-col bg-hueso p-6 shadow-xl">
            <div className="mb-8 flex items-center justify-between">
              <Logo tamano="sm" />
              <button type="button" onClick={() => setMenuAbierto(false)} aria-label="Cerrar menú">
                <IconoCerrar />
              </button>
            </div>
            <nav className="flex flex-col gap-1">
              {ENLACES.map((e) => (
                <Link
                  key={e.href}
                  href={e.href}
                  onClick={() => setMenuAbierto(false)}
                  className="border-b border-marino/10 py-3 font-serif text-xl"
                >
                  {e.texto}
                </Link>
              ))}
              <Link
                href="/carrito"
                onClick={() => setMenuAbierto(false)}
                className="border-b border-marino/10 py-3 font-serif text-xl"
              >
                Carrito {cantidadTotal > 0 && `(${cantidadTotal})`}
              </Link>
              <Link
                href="/cuenta"
                onClick={() => setMenuAbierto(false)}
                className="border-b border-marino/10 py-3 font-serif text-xl"
              >
                Mi cuenta
              </Link>
            </nav>
          </div>
        </div>
      )}
    </header>
  );
}
