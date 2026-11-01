import { createClient } from "@supabase/supabase-js";

// Cliente de solo lectura para las páginas públicas de la tienda (servidor).
// No usa sesión: solo ve lo que las políticas RLS permiten al público.
export function obtenerClientePublico() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !clave) return null;
  return createClient(url, clave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
