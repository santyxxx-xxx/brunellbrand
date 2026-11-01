// Se muestra mientras carga una página de la tienda (catálogo, producto...)
export default function Cargando() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4" role="status">
      <div className="grifo-brillo grifo-brillo--negro grifo-latido h-20 w-[70px]" />
      <span className="sr-only">Cargando...</span>
      <span className="h-px w-16 overflow-hidden bg-marino/10">
        <span className="barra-carga block h-full w-1/2 bg-ocre" />
      </span>
    </div>
  );
}
