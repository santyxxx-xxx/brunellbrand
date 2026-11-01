import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { obtenerClienteServidor } from "@/lib/supabase/servidor";

// El panel admin llama aquí después de guardar cambios,
// para que la tienda muestre los datos nuevos al instante.
export async function POST() {
  const supabase = await obtenerClienteServidor();
  const { data: esAdmin } = await supabase.rpc("es_admin");
  if (!esAdmin) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }
  revalidatePath("/", "layout");
  return NextResponse.json({ ok: true });
}
