import Encabezado from "@/components/tienda/Encabezado";
import PiePagina from "@/components/tienda/PiePagina";
import BotonesFlotantes from "@/components/tienda/BotonesFlotantes";
import { obtenerCategorias } from "@/lib/consultas";

export default async function LayoutTienda({ children }) {
  const categorias = await obtenerCategorias();
  return (
    <>
      <Encabezado categorias={categorias} />
      <main>{children}</main>
      <PiePagina categorias={categorias} />
      <BotonesFlotantes />
    </>
  );
}
