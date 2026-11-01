// Provincias del Ecuador (para el checkout y las tarifas de envío)
export const PROVINCIAS = [
  "Azuay",
  "Bolívar",
  "Cañar",
  "Carchi",
  "Chimborazo",
  "Cotopaxi",
  "El Oro",
  "Esmeraldas",
  "Galápagos",
  "Guayas",
  "Imbabura",
  "Loja",
  "Los Ríos",
  "Manabí",
  "Morona Santiago",
  "Napo",
  "Orellana",
  "Pastaza",
  "Pichincha",
  "Santa Elena",
  "Santo Domingo de los Tsáchilas",
  "Sucumbíos",
  "Tungurahua",
  "Zamora Chinchipe",
];

export const METODOS_ENVIO = {
  domicilio: "Entrega a domicilio",
  uber: "Envío por Uber",
  servientrega: "Servientrega",
};

// Estados del pedido: clave en la base de datos -> texto para mostrar
export const ESTADOS_PEDIDO = {
  pendiente_pago: { texto: "Pendiente de pago", color: "bg-amber-100 text-amber-800" },
  pagado: { texto: "Pagado", color: "bg-green-100 text-green-800" },
  enviado: { texto: "Enviado", color: "bg-blue-100 text-blue-800" },
  entregado: { texto: "Entregado", color: "bg-marino text-white" },
  cancelado: { texto: "Cancelado", color: "bg-red-100 text-red-700" },
};

// Páginas legales (slug -> título del enlace)
export const PAGINAS_LEGALES = [
  { slug: "envios", titulo: "Política de envíos" },
  { slug: "cambios-y-devoluciones", titulo: "Cambios y devoluciones" },
  { slug: "privacidad", titulo: "Política de privacidad" },
];
