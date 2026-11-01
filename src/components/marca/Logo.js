import { TIENDA } from "@/config/tienda";

// Logo oficial: grifo + palabra BRUNEL (imágenes recortadas del logo vectorial).
// tono="oscuro": negro, para fondos claros · tono="claro": dorado, para fondos marino
// tono="hueso": blanco hueso, para fondos marino más sobrios
export default function Logo({ tono = "oscuro", tamano = "md", className = "" }) {
  const color = { oscuro: "negro", claro: "dorado", hueso: "hueso" }[tono] || "negro";
  const alto = { sm: "h-8", md: "h-10", lg: "h-14" }[tamano];
  const altoTexto = { sm: "h-3.5", md: "h-4", lg: "h-6" }[tamano];

  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <img src={`/marca/grifo-${color}.webp`} alt="" className={`${alto} w-auto select-none`} draggable="false" />
      <img
        src={`/marca/texto-${color}.webp`}
        alt={TIENDA.nombre}
        className={`${altoTexto} w-auto select-none`}
        draggable="false"
      />
    </span>
  );
}
