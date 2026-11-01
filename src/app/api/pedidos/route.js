import { NextResponse } from "next/server";
import { obtenerClienteAdmin } from "@/lib/supabase/admin";
import { obtenerClienteServidor } from "@/lib/supabase/servidor";
import { validarCliente, validarItems } from "@/lib/pedidos/validar";
import { calcularPedido, crearPedido, iniciarPago, ErrorPedido } from "@/lib/pedidos/servidor";
import { urlSitio } from "@/lib/sitio";

export const dynamic = "force-dynamic";

// Crea un pedido desde el checkout y devuelve la URL de pago.
// Los precios, el envío y el total se calculan aquí con datos de la base de datos.
export async function POST(request) {
  let cuerpo;
  try {
    cuerpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  if (!cuerpo?.aceptaPoliticas) {
    return NextResponse.json({ error: "Debes aceptar la política de privacidad y las condiciones de compra." }, { status: 400 });
  }

  const validacionCliente = validarCliente(cuerpo.cliente);
  if (!validacionCliente.ok) {
    return NextResponse.json({ error: "Revisa los datos del formulario.", errores: validacionCliente.errores }, { status: 400 });
  }
  const validacionItems = validarItems(cuerpo.items);
  if (!validacionItems.ok) return NextResponse.json({ error: validacionItems.error }, { status: 400 });

  const tarifaId = parseInt(cuerpo.tarifaId, 10);
  if (!Number.isFinite(tarifaId)) return NextResponse.json({ error: "Elige una opción de envío." }, { status: 400 });

  try {
    const admin = obtenerClienteAdmin();
    const { cliente } = validacionCliente;

    // ¿Cliente con sesión iniciada? (opcional)
    let userId = null;
    try {
      const sesion = await obtenerClienteServidor();
      const { data } = await sesion.auth.getUser();
      userId = data?.user?.id || null;
    } catch {
      userId = null;
    }

    const calculo = await calcularPedido(admin, validacionItems.items, tarifaId, cliente.provincia);
    const pedido = await crearPedido(admin, { cliente, calculo, userId });

    if (userId && cuerpo.guardarDireccion) {
      await admin.from("perfiles_clientes").upsert({
        user_id: userId,
        nombre: cliente.nombre,
        cedula: cliente.cedula || null,
        telefono: cliente.telefono,
        provincia: cliente.provincia,
        ciudad: cliente.ciudad,
        sector: cliente.sector,
        direccion: cliente.direccion,
        referencia: cliente.referencia || null,
      });
    }

    const urlPedido = `/pedido/${pedido.id}?t=${pedido.token_acceso}`;
    const pago = await iniciarPago(admin, pedido, urlSitio(request));

    return NextResponse.json({
      pedidoId: pedido.id,
      numero: pedido.numero,
      urlPedido,
      urlPago: pago.url,
      aviso: pago.error || null,
    });
  } catch (error) {
    if (error instanceof ErrorPedido) {
      return NextResponse.json({ error: error.message }, { status: error.estado });
    }
    console.error("[api/pedidos]", error);
    return NextResponse.json({ error: "Ocurrió un error inesperado. Intenta de nuevo." }, { status: 500 });
  }
}
