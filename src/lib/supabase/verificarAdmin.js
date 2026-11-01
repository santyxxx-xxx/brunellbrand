import { obtenerClienteServidor } from "./servidor";

// Devuelve el usuario si la sesión actual pertenece a un administrador; si no, null.
export async function verificarAdmin() {
  try {
    const supabase = await obtenerClienteServidor();
    const { data } = await supabase.auth.getUser();
    if (!data?.user) return null;
    const { data: esAdmin } = await supabase.rpc("es_admin");
    return esAdmin ? data.user : null;
  } catch {
    return null;
  }
}
