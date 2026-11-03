"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { obtenerClienteNavegador } from "@/lib/supabase/cliente";
import Logo from "@/components/marca/Logo";

// soloAdmin: no se muestra al rol "vendedor"
const MENU = [
  { href: "/admin/vender", texto: "＋ Vender", destacado: true },
  { href: "/admin/dashboard", texto: "Dashboard", soloAdmin: true },
  { href: "/admin/pedidos", texto: "Pedidos" },
  { href: "/admin/reponer", texto: "Por reponer" },
  { href: "/admin", texto: "Productos" },
  { href: "/admin/productos/nuevo", texto: "Nuevo producto" },
  { href: "/admin/categorias", texto: "Categorías" },
  { href: "/admin/importar", texto: "Importar CSV" },
  { href: "/admin/envios", texto: "Envíos" },
  { href: "/admin/paginas", texto: "Páginas legales" },
];

// Envuelve todas las páginas del panel: verifica que el usuario sea admin
export default function PanelAdmin({ children }) {
  const [estado, setEstado] = useState("verificando"); // verificando | admin | sin-permiso
  const [correo, setCorreo] = useState("");
  const [perfil, setPerfil] = useState({ rol: "admin", nombre: "" });
  const ruta = usePathname();

  useEffect(() => {
    const supabase = obtenerClienteNavegador();
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data?.user) {
        window.location.href = "/admin/login";
        return;
      }
      setCorreo(data.user.email || "");
      const { data: esAdmin } = await supabase.rpc("es_admin");
      // Nombre y rol (si aún no se ejecutó fase3.sql, se asume admin)
      const { data: rol } = await supabase.rpc("mi_rol");
      if (rol) setPerfil(rol);
      setEstado(esAdmin ? "admin" : "sin-permiso");
    })();
  }, []);

  async function cerrarSesion() {
    await obtenerClienteNavegador().auth.signOut();
    window.location.href = "/admin/login";
  }

  if (estado === "verificando") {
    return <div className="flex min-h-screen items-center justify-center text-sm text-marino/60">Cargando panel...</div>;
  }

  if (estado === "sin-permiso") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <h1 className="font-serif text-3xl">Sin permisos de administrador</h1>
        <p className="mt-2 max-w-md text-sm text-marino/70">
          El usuario <strong>{correo}</strong> inició sesión, pero no está registrado como administrador.
          Agrégalo a la tabla <code>admins</code> en Supabase (ver README).
        </p>
        <button type="button" onClick={cerrarSesion} className="btn-borde mt-6">Cerrar sesión</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 bg-marino text-hueso">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/admin" className="flex items-center gap-2">
            <Logo tono="claro" tamano="sm" />
            <span className="text-xs text-ocre">{perfil.rol === "vendedor" ? "ventas" : "admin"}</span>
          </Link>
          <div className="flex items-center gap-4 text-xs">
            {perfil.nombre && <span className="text-hueso/90">Hola, {perfil.nombre}</span>}
            <Link href="/" target="_blank" className="hidden text-hueso/70 hover:text-ocre sm:inline">Ver tienda</Link>
            <button type="button" onClick={cerrarSesion} className="text-hueso/70 hover:text-ocre">Salir</button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2 pb-2">
          {MENU.filter((m) => !(m.soloAdmin && perfil.rol === "vendedor")).map((m) => (
            <Link
              key={m.href}
              href={m.href}
              className={`shrink-0 rounded-full px-4 py-1.5 text-sm transition ${
                ruta === m.href
                  ? "bg-ocre text-white"
                  : m.destacado
                    ? "bg-white text-marino font-semibold hover:bg-hueso"
                    : "text-hueso/80 hover:bg-white/10"
              }`}
            >
              {m.texto}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
