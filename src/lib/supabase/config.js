// Lee y limpia las variables de entorno de Supabase.
// Quita espacios, comillas y la barra final que a veces se cuelan al pegarlas en Vercel.
function limpiar(valor) {
  return String(valor || "")
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .trim();
}

function limpiarUrl(valor) {
  let url = limpiar(valor).replace(/\/+$/, "");
  // Si se pegó solo "xxxx.supabase.co", se agrega https://
  if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
  return url;
}

export const SUPABASE_URL = limpiarUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
export const SUPABASE_CLAVE = limpiar(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

function urlValida(url) {
  try {
    const { protocol } = new URL(url);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

export const SUPABASE_CONFIGURADO = urlValida(SUPABASE_URL) && SUPABASE_CLAVE.length > 0;

if (!SUPABASE_CONFIGURADO) {
  console.error(
    "[supabase] Variables de entorno inválidas o vacías. Revisa NEXT_PUBLIC_SUPABASE_URL " +
      `(valor leído: "${SUPABASE_URL}") y NEXT_PUBLIC_SUPABASE_ANON_KEY.`
  );
}
