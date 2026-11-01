import Encabezado from "@/components/tienda/Encabezado";
import PiePagina from "@/components/tienda/PiePagina";
import BotonesFlotantes from "@/components/tienda/BotonesFlotantes";
import PantallaCarga from "@/components/marca/PantallaCarga";
import { CLAVE_INTRO } from "@/lib/intro";
import { obtenerCategorias } from "@/lib/consultas";

// Antes de pintar: si la presentación ya se vio en esta visita, se oculta (evita parpadeos)
const scriptIntro = `try{if(sessionStorage.getItem("${CLAVE_INTRO}")==="1")document.documentElement.classList.add("sin-intro")}catch(e){}`;

export default async function LayoutTienda({ children }) {
  const categorias = await obtenerCategorias();
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: scriptIntro }} />
      <PantallaCarga />
      <Encabezado categorias={categorias} />
      <main>{children}</main>
      <PiePagina categorias={categorias} />
      <BotonesFlotantes />
    </>
  );
}
