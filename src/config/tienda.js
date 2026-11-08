// =====================================================================
// Configuración general de la tienda.
// Aquí cambias los números de WhatsApp, Instagram, textos del banner
// y la guía de tallas, sin tocar el resto del código.
// =====================================================================

export const TIENDA = {
  nombre: "Brunel Brand",
  marca: "BRUNEL", // palabra que acompaña al grifo en el logo
  ciudad: "Quito, Ecuador",
  descripcion: "Camisas y polos para hombre con corte impecable. Envíos a todo el Ecuador.",

  // Instagram: pega aquí el enlace completo de tu perfil.
  instagram: "https://www.instagram.com/brunelbrand",

  // WhatsApp: formato internacional SIN "+", SIN espacios.
  // Ejemplo Ecuador: 0991234567  ->  593991234567
  // El primero es el que se usa en "Pedir por WhatsApp" y en el carrito.
  whatsapp: [
    { etiqueta: "Ventas", numero: "593963085289" },
    // Para agregar un segundo número, descomenta y cambia esta línea:
    // { etiqueta: "Atención al cliente", numero: "5939XXXXXXXX" },
  ],
};

// Banner de la página de inicio.
// Si subes una foto al bucket "productos" (o cualquier URL), ponla en "imagen".
export const BANNER = {
  antetitulo: "Nueva colección",
  titulo: "La elegancia está en los detalles.",
  texto: "Camisas y polos para hombre. Envíos a todo el Ecuador.",
  boton: "Ver catálogo",
  imagen: "", // ej: "https://kxzsjipplrsausstryez.supabase.co/storage/v1/object/public/productos/banner.jpg"
};

// Tallas que se muestran en filtros, formularios e importación.
export const TALLAS = ["S", "M", "L"];

// Guía de tallas (medidas referenciales en centímetros).
// Ajusta los valores a tus prendas reales.
export const GUIA_TALLAS = {
  nota: "Medidas referenciales de la prenda en centímetros. Si estás entre dos tallas, elige la mayor para un calce más holgado.",
  columnas: ["Talla", "Pecho", "Largo", "Hombros", "Manga larga"],
  filas: [
    ["S", "96–100", "72", "44", "62"],
    ["M", "102–106", "74", "46", "63"],
    ["L", "108–112", "76", "48", "64"],
  ],
  comoMedir: [
    "Pecho: mide alrededor de la parte más ancha del pecho, por debajo de las axilas.",
    "Largo: desde el punto más alto del hombro hasta el borde inferior de la prenda.",
    "Hombros: de costura a costura, por la espalda.",
  ],
};
