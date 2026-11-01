"use client";

import { createBrowserClient } from "@supabase/ssr";
import { SUPABASE_CLAVE, SUPABASE_URL } from "./config";

let cliente;

// Cliente de Supabase para el navegador (panel admin y login).
// Guarda la sesión en cookies para que el middleware pueda leerla.
export function obtenerClienteNavegador() {
  if (!cliente) {
    cliente = createBrowserClient(
      SUPABASE_URL,
      SUPABASE_CLAVE
    );
  }
  return cliente;
}
