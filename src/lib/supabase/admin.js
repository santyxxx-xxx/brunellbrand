import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL } from "./config";

// ⚠️ SOLO PARA EL SERVIDOR (rutas /api y páginas de servidor).
// Usa la clave secreta "service_role", que salta las reglas RLS.
// Nunca importes este archivo en un componente "use client".
export function obtenerClienteAdmin() {
  const clave = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!clave || !SUPABASE_URL) {
    throw new Error("Falta configurar SUPABASE_SERVICE_ROLE_KEY en las variables de entorno.");
  }
  return createClient(SUPABASE_URL, clave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
