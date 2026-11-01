"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { obtenerClienteNavegador } from "@/lib/supabase/cliente";
import { ESTADOS_PEDIDO, PROVINCIAS } from "@/config/envios";
import { formatearPrecio } from "@/lib/utilidades";

// Cuenta del cliente (opcional): iniciar sesión, dirección guardada e historial de pedidos.
export default function Cuenta() {
  const [usuario, setUsuario] = useState(undefined); // undefined = cargando

  useEffect(() => {
    const supabase = obtenerClienteNavegador();
    supabase.auth.getUser().then(({ data }) => setUsuario(data?.user || null));
    const { data: sub } = supabase.auth.onAuthStateChange((_evento, sesion) => setUsuario(sesion?.user || null));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (usuario === undefined) return <div className="contenedor min-h-[50vh] pt-10" />;
  return (
    <div className="contenedor max-w-3xl pt-10">
      {usuario ? <MiCuenta usuario={usuario} /> : <Acceso />}
    </div>
  );
}

function Acceso() {
  const [modo, setModo] = useState("ingresar"); // ingresar | registro | recuperar
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [mensaje, setMensaje] = useState(null);
  const [cargando, setCargando] = useState(false);

  function volver() {
    const destino = new URLSearchParams(window.location.search).get("volver");
    if (destino && destino.startsWith("/")) window.location.href = destino;
  }

  async function enviar(e) {
    e.preventDefault();
    setMensaje(null);
    setCargando(true);
    const supabase = obtenerClienteNavegador();
    const origen = window.location.origin;

    if (modo === "ingresar") {
      const { error } = await supabase.auth.signInWithPassword({ email: correo.trim(), password: clave });
      if (error) setMensaje({ tipo: "error", texto: "Correo o contraseña incorrectos, o la cuenta no está confirmada." });
      else volver();
    } else if (modo === "registro") {
      if (clave.length < 8) {
        setCargando(false);
        return setMensaje({ tipo: "error", texto: "La contraseña debe tener al menos 8 caracteres." });
      }
      const { data, error } = await supabase.auth.signUp({
        email: correo.trim(),
        password: clave,
        options: { emailRedirectTo: `${origen}/cuenta` },
      });
      if (error) setMensaje({ tipo: "error", texto: error.message });
      else if (!data.session) setMensaje({ tipo: "ok", texto: "¡Listo! Te enviamos un correo para confirmar tu cuenta." });
      else volver();
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(correo.trim(), {
        redirectTo: `${origen}/cuenta?recuperar=1`,
      });
      setMensaje(
        error
          ? { tipo: "error", texto: error.message }
          : { tipo: "ok", texto: "Si el correo está registrado, te llegará un enlace para crear una nueva contraseña." }
      );
    }
    setCargando(false);
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="titulo-seccion text-center">
        {modo === "registro" ? "Crear cuenta" : modo === "recuperar" ? "Recuperar contraseña" : "Mi cuenta"}
      </h1>
      <p className="mt-2 text-center text-sm text-marino/60">
        Con tu cuenta guardas tu dirección y ves el historial de tus pedidos. También puedes comprar como invitado.
      </p>

      <form onSubmit={enviar} className="mt-6 space-y-4 rounded-2xl bg-white p-6">
        <input className="campo" type="email" required autoComplete="email" placeholder="Correo electrónico" value={correo} onChange={(e) => setCorreo(e.target.value)} />
        {modo !== "recuperar" && (
          <input
            className="campo"
            type="password"
            required
            autoComplete={modo === "registro" ? "new-password" : "current-password"}
            placeholder={modo === "registro" ? "Contraseña (mínimo 8 caracteres)" : "Contraseña"}
            value={clave}
            onChange={(e) => setClave(e.target.value)}
          />
        )}
        {mensaje && (
          <p className={`rounded-lg p-3 text-sm ${mensaje.tipo === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
            {mensaje.texto}
          </p>
        )}
        <button type="submit" disabled={cargando} className="btn-ocre w-full">
          {cargando ? "Un momento..." : modo === "registro" ? "Crear cuenta" : modo === "recuperar" ? "Enviar enlace" : "Ingresar"}
        </button>
        <div className="flex justify-between text-xs">
          {modo === "ingresar" ? (
            <>
              <button type="button" className="underline" onClick={() => setModo("registro")}>Crear una cuenta</button>
              <button type="button" className="underline" onClick={() => setModo("recuperar")}>Olvidé mi contraseña</button>
            </>
          ) : (
            <button type="button" className="underline" onClick={() => setModo("ingresar")}>Ya tengo cuenta</button>
          )}
        </div>
      </form>
    </div>
  );
}

function MiCuenta({ usuario }) {
  const [perfil, setPerfil] = useState({});
  const [pedidos, setPedidos] = useState([]);
  const [mensaje, setMensaje] = useState("");
  const [nuevaClave, setNuevaClave] = useState("");
  const recuperando = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("recuperar") === "1";

  useEffect(() => {
    const supabase = obtenerClienteNavegador();
    (async () => {
      const [{ data: p }, { data: lista }] = await Promise.all([
        supabase.from("perfiles_clientes").select("*").eq("user_id", usuario.id).maybeSingle(),
        supabase
          .from("orders")
          .select("id, numero, estado, total, creado_en, numero_guia")
          .eq("user_id", usuario.id)
          .order("creado_en", { ascending: false }),
      ]);
      setPerfil(p || {});
      setPedidos(lista || []);
    })();
  }, [usuario.id]);

  async function guardarPerfil(e) {
    e.preventDefault();
    const { error } = await obtenerClienteNavegador()
      .from("perfiles_clientes")
      .upsert({
        user_id: usuario.id,
        nombre: perfil.nombre || null,
        cedula: perfil.cedula || null,
        telefono: perfil.telefono || null,
        provincia: perfil.provincia || null,
        ciudad: perfil.ciudad || null,
        sector: perfil.sector || null,
        direccion: perfil.direccion || null,
        referencia: perfil.referencia || null,
      });
    setMensaje(error ? `Error: ${error.message}` : "Datos guardados.");
  }

  async function cambiarClave(e) {
    e.preventDefault();
    if (nuevaClave.length < 8) return setMensaje("La contraseña debe tener al menos 8 caracteres.");
    const { error } = await obtenerClienteNavegador().auth.updateUser({ password: nuevaClave });
    setMensaje(error ? `Error: ${error.message}` : "Contraseña actualizada.");
    setNuevaClave("");
  }

  async function salir() {
    await obtenerClienteNavegador().auth.signOut();
    window.location.href = "/";
  }

  const campo = (clave) => ({
    value: perfil[clave] || "",
    onChange: (e) => setPerfil((p) => ({ ...p, [clave]: e.target.value })),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="etiqueta text-ocre">Mi cuenta</p>
          <h1 className="titulo-seccion mt-1">Hola{perfil.nombre ? `, ${perfil.nombre.split(" ")[0]}` : ""}</h1>
          <p className="text-sm text-marino/60">{usuario.email}</p>
        </div>
        <button type="button" onClick={salir} className="text-sm underline underline-offset-4">Cerrar sesión</button>
      </div>

      {mensaje && <p className="rounded-lg bg-white p-3 text-sm">{mensaje}</p>}

      {recuperando && (
        <form onSubmit={cambiarClave} className="flex gap-2 rounded-2xl bg-white p-5">
          <input className="campo" type="password" autoComplete="new-password" placeholder="Nueva contraseña" value={nuevaClave} onChange={(e) => setNuevaClave(e.target.value)} />
          <button type="submit" className="btn-ocre shrink-0">Cambiar</button>
        </form>
      )}

      <section className="rounded-2xl bg-white p-5">
        <h2 className="etiqueta mb-3">Mis pedidos</h2>
        {pedidos.length === 0 ? (
          <p className="text-sm text-marino/60">
            Aún no tienes pedidos. <Link href="/catalogo" className="text-ocre underline">Ver catálogo</Link>
          </p>
        ) : (
          <ul className="divide-y divide-marino/10">
            {pedidos.map((p) => (
              <li key={p.id}>
                <Link href={`/pedido/${p.id}`} className="flex items-center justify-between gap-3 py-3 text-sm hover:text-ocre">
                  <span>
                    <strong>#{p.numero}</strong>
                    <span className="ml-2 text-marino/60">{new Date(p.creado_en).toLocaleDateString("es-EC")}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${ESTADOS_PEDIDO[p.estado]?.color}`}>
                      {ESTADOS_PEDIDO[p.estado]?.texto}
                    </span>
                    <span className="font-semibold">{formatearPrecio(p.total)}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <form onSubmit={guardarPerfil} className="rounded-2xl bg-white p-5">
        <h2 className="etiqueta mb-3">Mi dirección de entrega</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <input className="campo sm:col-span-2" placeholder="Nombre y apellido" {...campo("nombre")} />
          <input className="campo" placeholder="Teléfono" inputMode="tel" {...campo("telefono")} />
          <input className="campo" placeholder="Cédula (opcional)" inputMode="numeric" {...campo("cedula")} />
          <select className="campo" {...campo("provincia")}>
            <option value="">Provincia</option>
            {PROVINCIAS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <input className="campo" placeholder="Ciudad" {...campo("ciudad")} />
          <input className="campo sm:col-span-2" placeholder="Sector / barrio" {...campo("sector")} />
          <input className="campo sm:col-span-2" placeholder="Dirección" {...campo("direccion")} />
          <input className="campo sm:col-span-2" placeholder="Referencia" {...campo("referencia")} />
        </div>
        <button type="submit" className="btn-marino mt-4">Guardar dirección</button>
      </form>

      {!recuperando && (
        <form onSubmit={cambiarClave} className="flex gap-2 rounded-2xl bg-white p-5">
          <input className="campo" type="password" autoComplete="new-password" placeholder="Cambiar contraseña" value={nuevaClave} onChange={(e) => setNuevaClave(e.target.value)} />
          <button type="submit" className="btn-borde shrink-0">Cambiar</button>
        </form>
      )}
    </div>
  );
}
