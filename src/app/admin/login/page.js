"use client";

import { useState } from "react";
import Link from "next/link";
import { obtenerClienteNavegador } from "@/lib/supabase/cliente";

export default function LoginAdmin() {
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function ingresar(e) {
    e.preventDefault();
    setError("");
    setCargando(true);
    const supabase = obtenerClienteNavegador();
    const { error } = await supabase.auth.signInWithPassword({ email: correo.trim(), password: clave });
    if (error) {
      setError("Correo o contraseña incorrectos.");
      setCargando(false);
      return;
    }
    // Recarga completa para que el middleware lea la nueva sesión
    window.location.href = "/admin";
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={ingresar} className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm">
        <div className="mb-8 text-center">
          <p className="font-serif text-3xl tracking-[0.18em]">BRUNEL</p>
          <p className="text-[9px] font-semibold tracking-[0.5em] text-ocre">BRAND</p>
          <p className="mt-4 text-sm text-marino/60">Panel de administración</p>
        </div>

        <label className="mb-1 block text-sm font-medium" htmlFor="correo">Correo</label>
        <input id="correo" type="email" required autoComplete="email" className="campo" value={correo} onChange={(e) => setCorreo(e.target.value)} />

        <label className="mb-1 mt-4 block text-sm font-medium" htmlFor="clave">Contraseña</label>
        <input id="clave" type="password" required autoComplete="current-password" className="campo" value={clave} onChange={(e) => setClave(e.target.value)} />

        {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        <button type="submit" disabled={cargando} className="btn-ocre mt-6 w-full">
          {cargando ? "Ingresando..." : "Ingresar"}
        </button>

        <Link href="/" className="mt-4 block text-center text-xs text-marino/60 underline underline-offset-4">
          Volver a la tienda
        </Link>
      </form>
    </div>
  );
}
