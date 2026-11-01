import { createClient } from "@supabase/supabase-js";
import { SUPABASE_CLAVE, SUPABASE_CONFIGURADO, SUPABASE_URL } from "./config";

// Cliente de solo lectura para las páginas públicas de la tienda (servidor).
// No usa sesión: solo ve lo que las políticas RLS permiten al público.
// Si las variables de entorno están mal, devuelve null y la tienda se muestra vacía en vez de caerse.
export function obtenerClientePublico() {
  if (!SUPABASE_CONFIGURADO) return null;
  return createClient(SUPABASE_URL, SUPABASE_CLAVE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
