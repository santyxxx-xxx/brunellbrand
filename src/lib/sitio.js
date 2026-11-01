// URL pública de la tienda (para enlaces en correos y para la pasarela de pagos).
// Orden: NEXT_PUBLIC_SITE_URL > dominio de producción de Vercel > origen de la petición.
export function urlSitio(request) {
  const configurada = (process.env.NEXT_PUBLIC_SITE_URL || "").trim().replace(/\/+$/, "");
  if (configurada) return /^https?:\/\//.test(configurada) ? configurada : `https://${configurada}`;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (request?.nextUrl?.origin) return request.nextUrl.origin;
  return "http://localhost:3000";
}

// Número de pedido para mostrar: #1001
export function numeroPedido(numero) {
  return `#${numero}`;
}
