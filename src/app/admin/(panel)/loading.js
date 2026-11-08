// Se muestra al instante al cambiar de sección en el panel, mientras carga la siguiente
export default function CargandoPanel() {
  return (
    <div className="space-y-4" role="status">
      <span className="sr-only">Cargando...</span>
      <div className="h-8 w-48 animate-pulse rounded-lg bg-marino/10" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-white" />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="aspect-[3/4] animate-pulse rounded-xl bg-white" />
        ))}
      </div>
    </div>
  );
}
