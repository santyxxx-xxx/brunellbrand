"use client";

import { useEffect, useState } from "react";
import { useCarrito } from "@/context/CarritoContext";

// Vacía el carrito cuando el pago del pedido está confirmado
export function LimpiarCarrito() {
  const { vaciar, cargado } = useCarrito();
  useEffect(() => {
    if (cargado) vaciar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargado]);
  return null;
}

// Botón para reintentar el pago de un pedido pendiente
export function ReintentarPago({ pedidoId, token, texto = "Pagar ahora" }) {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  async function pagar() {
    setCargando(true);
    setError("");
    try {
      const respuesta = await fetch(`/api/pedidos/${pedidoId}/pagar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const r = await respuesta.json();
      if (!respuesta.ok || !r.urlPago) throw new Error(r.error || "No se pudo iniciar el pago.");
      window.location.href = r.urlPago;
    } catch (e) {
      setError(e.message);
      setCargando(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={pagar} disabled={cargando} className="btn-ocre w-full py-4">
        {cargando ? "Conectando con PayPhone..." : texto}
      </button>
      {error && <p className="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    </div>
  );
}
