"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

const CarritoContext = createContext(null);
const CLAVE = "brunel-carrito-v1";

// Cada ítem: { clave, productoId, slug, nombre, precio, imagen, talla, cantidad, stock }
export function CarritoProvider({ children }) {
  const [items, setItems] = useState([]);
  const [cargado, setCargado] = useState(false);

  // Recupera el carrito guardado en el navegador
  useEffect(() => {
    try {
      const guardado = localStorage.getItem(CLAVE);
      if (guardado) setItems(JSON.parse(guardado));
    } catch {
      // si el navegador bloquea el almacenamiento, el carrito vive solo en memoria
    }
    setCargado(true);
  }, []);

  useEffect(() => {
    if (!cargado) return;
    try {
      localStorage.setItem(CLAVE, JSON.stringify(items));
    } catch {
      /* sin almacenamiento disponible */
    }
  }, [items, cargado]);

  const valor = useMemo(() => {
    function agregar(item) {
      setItems((actuales) => {
        const clave = `${item.productoId}-${item.talla}`;
        const existente = actuales.find((i) => i.clave === clave);
        if (existente) {
          return actuales.map((i) =>
            i.clave === clave
              ? { ...i, cantidad: Math.min(i.cantidad + item.cantidad, item.stock || 99) }
              : i
          );
        }
        return [...actuales, { ...item, clave }];
      });
    }

    function cambiarCantidad(clave, cantidad) {
      setItems((actuales) =>
        actuales
          .map((i) => (i.clave === clave ? { ...i, cantidad: Math.min(cantidad, i.stock || 99) } : i))
          .filter((i) => i.cantidad > 0)
      );
    }

    function quitar(clave) {
      setItems((actuales) => actuales.filter((i) => i.clave !== clave));
    }

    function vaciar() {
      setItems([]);
    }

    const cantidadTotal = items.reduce((s, i) => s + i.cantidad, 0);
    const subtotal = items.reduce((s, i) => s + i.cantidad * Number(i.precio), 0);

    return { items, cargado, agregar, cambiarCantidad, quitar, vaciar, cantidadTotal, subtotal };
  }, [items, cargado]);

  return <CarritoContext.Provider value={valor}>{children}</CarritoContext.Provider>;
}

export function useCarrito() {
  const contexto = useContext(CarritoContext);
  if (!contexto) throw new Error("useCarrito debe usarse dentro de CarritoProvider");
  return contexto;
}
