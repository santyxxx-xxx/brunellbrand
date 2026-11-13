import Link from "next/link";
import { obtenerPedidosEntregados, obtenerPrendasEntregadas } from "@/lib/consultas";
import { TIENDA } from "@/config/tienda";

function Icono({ tipo }) {
  const comun = { className: "h-5 w-5 shrink-0 text-ocre", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.6, "aria-hidden": true };
  if (tipo === "entregados")
    return (<svg {...comun}><circle cx="12" cy="12" r="9" /><path d="m8 12.5 2.6 2.5L16 9.5" strokeLinecap="round" strokeLinejoin="round" /></svg>);
  if (tipo === "envios")
    return (<svg {...comun}><path d="M3 7h11v9H3zM14 10h4l3 3v3h-7" strokeLinejoin="round" /><circle cx="7" cy="17.5" r="1.6" /><circle cx="17" cy="17.5" r="1.6" /></svg>);
  if (tipo === "cambios")
    return (<svg {...comun}><path d="M4 9h13l-3-3M20 15H7l3 3" strokeLinecap="round" strokeLinejoin="round" /></svg>);
  return (<svg {...comun}><rect x="5" y="10.5" width="14" height="9" rx="2" /><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" /></svg>);
}

// "Más de 900": redondea hacia abajo para que la frase siempre sea cierta
function masDe(total) {
  const paso = total > 100 ? 100 : 10;
  return Math.floor((total - 1) / paso) * paso;
}

// Franja de confianza. El contador sale de la base de datos (historial real desde 2024)
// y se redondea hacia abajo; si no hay datos, no se muestra (nunca se inventan cifras).
export default async function FranjaConfianza({ compacta = false }) {
  const [prendas, pedidos] = await Promise.all([obtenerPrendasEntregadas(), obtenerPedidosEntregados()]);
  const contador =
    prendas > 10
      ? { titulo: `Más de ${masDe(prendas).toLocaleString("es-EC")} prendas entregadas`, texto: "Clientes reales, compras reales" }
      : pedidos > 0
        ? { titulo: `${pedidos.toLocaleString("es-EC")} ${pedidos === 1 ? "pedido entregado" : "pedidos entregados"}`, texto: "Clientes reales, compras reales" }
        : null;
  const items = [
    contador && { tipo: "entregados", ...contador },
    { tipo: "envios", titulo: "Envíos a todo el país", texto: "Servientrega y entrega local en Quito" },
    { tipo: "cambios", titulo: "Cambios fáciles", texto: "15 días para cambiar tu prenda", href: "/politicas/cambios-y-devoluciones" },
    TIENDA.pagoEnLinea
      ? { tipo: "pago", titulo: "Pago seguro", texto: "Tarjeta de crédito o débito con PayPhone" }
      : { tipo: "pago", titulo: "Paga como prefieras", texto: "Transferencia, efectivo o tarjeta" },
  ].filter(Boolean);

  return (
    <div
      className={`grid gap-px overflow-hidden rounded-2xl bg-marino/10 ${
        items.length === 4 ? "grid-cols-2 lg:grid-cols-4" : "grid-cols-1 sm:grid-cols-3"
      }`}
    >
      {items.map((item) => {
        const contenido = (
          <>
            <Icono tipo={item.tipo} />
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold leading-tight">{item.titulo}</span>
              {!compacta && <span className="mt-0.5 block text-[11px] leading-snug text-marino/60">{item.texto}</span>}
            </span>
          </>
        );
        const clase = `flex items-start gap-2.5 bg-white ${compacta ? "p-3" : "p-4"}`;
        return item.href ? (
          <Link key={item.tipo} href={item.href} className={`${clase} transition hover:bg-hueso`}>{contenido}</Link>
        ) : (
          <div key={item.tipo} className={clase}>{contenido}</div>
        );
      })}
    </div>
  );
}
