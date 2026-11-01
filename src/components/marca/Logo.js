import { TIENDA } from "@/config/tienda";

// Logo: grifo dorado + palabra BRUNELL.
// tono="oscuro" para fondos claros (hueso/blanco), tono="claro" para fondos marino.
export default function Logo({ tono = "oscuro", tamano = "md", className = "" }) {
  const alto = { sm: "h-8", md: "h-10", lg: "h-14" }[tamano];
  const texto = { sm: "text-lg", md: "text-xl", lg: "text-3xl" }[tamano];
  const src = tono === "claro" ? "/marca/grifo-claro.webp" : "/marca/grifo-oscuro.webp";

  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <img src={src} alt="" className={`${alto} w-auto select-none`} draggable="false" />
      <span className="flex flex-col leading-none">
        <span className={`font-serif ${texto} font-semibold tracking-[0.18em]`}>{TIENDA.marca}</span>
        <span className="mt-0.5 text-[8px] font-semibold tracking-[0.55em] text-ocre">BRAND</span>
      </span>
    </span>
  );
}
