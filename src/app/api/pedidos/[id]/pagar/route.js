import { NextResponse } from "next/server";
import { obtenerClienteAdmin } from "@/lib/supabase/admin";
import { iniciarPago } from "@/lib/pedidos/servidor";
import { urlSitio } from "@/lib/sitio";

export const dynamic = "force-dynamic";

// Reintentar el pago de un pedido que quedó "pendiente de pago".
export async function POST(request, { params }) {
  const { id } = await params;
  let token = "";
  try {
    token = (await request.json())?.token || "";
  } catch {
    /* sin cuerpo */
  }

  const admin = obtenerClienteAdmin();
  const { data: pedido } = await admin.from("orders").select("*").eq("id", id).maybeSingle();
  if (!pedido || String(pedido.token_acceso) !== String(token)) {
    return NextResponse.json({ error: "Pedido no encontrado." }, { status: 404 });
  }
  if (pedido.estado !== "pendiente_pago") {
    return NextResponse.json({ error: "Este pedido ya no está pendiente de pago." }, { status: 409 });
  }

  // Revisa que aún haya stock antes de cobrar
  const { data: items } = await admin
    .from("order_items")
    .select("nombre, talla, cantidad, producto:productos(activo, tallas:producto_tallas(talla, stock))")
    .eq("order_id", id);
  const sinStock = (items || []).filter((i) => {
    const t = i.producto?.tallas?.find((x) => x.talla === i.talla);
    return !i.producto?.activo || !t || t.stock < i.cantidad;
  });
  if (sinStock.length) {
    return NextResponse.json(
      {
        error: `Ya no hay stock suficiente de: ${sinStock.map((i) => `${i.nombre} (${i.talla})`).join(", ")}. Escríbenos por WhatsApp y te ayudamos.`,
      },
      { status: 409 }
    );
  }

  const pago = await iniciarPago(admin, pedido, urlSitio(request));
  if (!pago.url) return NextResponse.json({ error: pago.error }, { status: 502 });
  return NextResponse.json({ urlPago: pago.url });
}
