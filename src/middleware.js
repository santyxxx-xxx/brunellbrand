import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_CLAVE, SUPABASE_CONFIGURADO, SUPABASE_URL } from "@/lib/supabase/config";

// Protege el panel /admin: si no hay sesión, envía al login.
// (Los permisos reales los aplica Supabase con RLS: solo los admins pueden escribir.)
export async function middleware(request) {
  let respuesta = NextResponse.next({ request });
  if (!SUPABASE_CONFIGURADO) return respuesta;

  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_CLAVE,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesParaGuardar) {
          cookiesParaGuardar.forEach(({ name, value }) => request.cookies.set(name, value));
          respuesta = NextResponse.next({ request });
          cookiesParaGuardar.forEach(({ name, value, options }) =>
            respuesta.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getSession lee la sesión de la cookie sin ir a internet: la navegación del panel es instantánea.
  // La seguridad real no depende de esto: Supabase (RLS) revisa cada consulta y el panel verifica al usuario.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;

  const { pathname } = request.nextUrl;
  const esLogin = pathname === "/admin/login";

  if (!user && !esLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin/login";
    return NextResponse.redirect(url);
  }

  if (user && esLogin) {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    return NextResponse.redirect(url);
  }

  return respuesta;
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
