"use client";

import { createBrowserClient } from "@supabase/ssr";

let cliente;

// Cliente de Supabase para el navegador (panel admin y login).
// Guarda la sesión en cookies para que el middleware pueda leerla.
export function obtenerClienteNavegador() {
  if (!cliente) {
    cliente = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );
  }
  return cliente;
}
