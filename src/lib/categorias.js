// Convierte la lista plana de categorías en árbol:
// categorías principales (sin parent_id) con sus subcategorías en "hijos".
export function arbolCategorias(categorias = []) {
  const principales = categorias.filter((c) => !c.parent_id);
  return principales.map((p) => ({ ...p, hijos: categorias.filter((c) => c.parent_id === p.id) }));
}

// Devuelve la categoría principal de una categoría (o ella misma si ya es principal)
export function categoriaPrincipal(categorias = [], slug) {
  const actual = categorias.find((c) => c.slug === slug);
  if (!actual) return null;
  return actual.parent_id ? categorias.find((c) => c.id === actual.parent_id) || actual : actual;
}
