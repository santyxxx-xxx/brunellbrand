import Link from "next/link";
import { formatearPrecio, ordenarTallas, stockTotal } from "@/lib/utilidades";

export default function TarjetaProducto({ producto }) {
  const portada = producto.imagenes?.[0];
  const segunda = producto.imagenes?.[1];
  const tallas = ordenarTallas(producto.tallas || []);
  const agotado = stockTotal(tallas) === 0;
  const enOferta = producto.precio_anterior && Number(producto.precio_anterior) > Number(producto.precio);

  return (
    <Link href={`/producto/${producto.slug}`} className="group block">
      <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-hueso-oscuro">
        {portada ? (
          <>
            <img
              src={portada}
              alt={producto.nombre}
              loading="lazy"
              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            />
            {segunda && (
              <img
                src={segunda}
                alt=""
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover opacity-0 transition duration-500 group-hover:opacity-100"
              />
            )}
          </>
        ) : (
          <div className="flex h-full items-center justify-center">
            <img src="/marca/grifo-negro.webp" alt="" className="h-20 w-auto opacity-15" />
          </div>
        )}

        <div className="absolute left-2 top-2 flex flex-col gap-1">
          {agotado && <span className="rounded-full bg-marino px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">Agotado</span>}
          {!agotado && enOferta && <span className="rounded-full bg-ocre px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">Oferta</span>}
        </div>
      </div>

      <div className="mt-3 space-y-1">
        {producto.categoria?.nombre && (
          <p className="etiqueta text-marino/50">{producto.categoria.nombre}</p>
        )}
        <h3 className="line-clamp-2 text-sm font-medium leading-snug">{producto.nombre}</h3>
        <div className="flex items-baseline gap-2">
          <span className="font-semibold">{formatearPrecio(producto.precio)}</span>
          {enOferta && (
            <span className="text-xs text-marino/50 line-through">{formatearPrecio(producto.precio_anterior)}</span>
          )}
        </div>
        {!agotado && (
          <div className="flex gap-1 pt-1">
            {tallas.map((t) => (
              <span
                key={t.talla}
                className={`text-[11px] ${t.stock > 0 ? "text-marino/70" : "text-marino/25 line-through"}`}
              >
                {t.talla}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
