import { Cormorant_Garamond, Manrope } from "next/font/google";
import "./globals.css";
import { CarritoProvider } from "@/context/CarritoContext";
import { TIENDA } from "@/config/tienda";

const fuenteTitulos = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--fuente-titulos",
  display: "swap",
});

const fuenteTexto = Manrope({
  subsets: ["latin"],
  variable: "--fuente-texto",
  display: "swap",
});

export const metadata = {
  title: {
    default: `${TIENDA.nombre} · Ropa para hombre en Quito`,
    template: `%s · ${TIENDA.nombre}`,
  },
  description: TIENDA.descripcion,
};

export const viewport = {
  themeColor: "#1F2A44",
};

export default function RootLayout({ children }) {
  return (
    <html lang="es-EC" className={`${fuenteTitulos.variable} ${fuenteTexto.variable}`}>
      <body className="min-h-screen antialiased">
        <CarritoProvider>{children}</CarritoProvider>
      </body>
    </html>
  );
}
