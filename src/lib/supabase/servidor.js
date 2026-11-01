import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_CLAVE, SUPABASE_URL } from "./config";

// Cliente de Supabase en el servidor con la sesión del usuario (cookies).
export async function obtenerClienteServidor() {
  const almacen = await cookies();
  return createServerClient(
    SUPABASE_URL,
    SUPABASE_CLAVE,
    {
      cookies: {
        getAll() {
          return almacen.getAll();
        },
        setAll(cookiesParaGuardar) {
          try {
            cookiesParaGuardar.forEach(({ name, value, options }) => almacen.set(name, value, options));
          } catch {
            // Llamado desde un Server Component: el middleware se encarga de refrescar la sesión.
          }
        },
      },
    }
  );
}
