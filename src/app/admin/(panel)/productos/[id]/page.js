import FormularioProducto from "@/components/admin/FormularioProducto";

export default async function EditarProducto({ params }) {
  const { id } = await params;
  return <FormularioProducto productoId={id} />;
}
