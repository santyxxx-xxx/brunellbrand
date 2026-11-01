// Muestra texto con un formato sencillo (tipo Markdown), sin HTML peligroso:
//   ## Título        ### Subtítulo
//   - elemento de lista
//   **negrita**
//   (línea en blanco = nuevo párrafo)

function enLinea(texto, clave) {
  return String(texto)
    .split(/(\*\*[^*]+\*\*)/g)
    .map((parte, i) =>
      parte.startsWith("**") && parte.endsWith("**") ? (
        <strong key={`${clave}-${i}`}>{parte.slice(2, -2)}</strong>
      ) : (
        parte
      )
    );
}

export default function TextoFormateado({ texto = "" }) {
  const bloques = [];
  let parrafo = [];
  let lista = [];

  const cerrarParrafo = () => {
    if (parrafo.length) bloques.push({ tipo: "p", contenido: parrafo.join(" ") });
    parrafo = [];
  };
  const cerrarLista = () => {
    if (lista.length) bloques.push({ tipo: "ul", contenido: lista });
    lista = [];
  };

  String(texto)
    .replace(/\r/g, "")
    .split("\n")
    .forEach((linea) => {
      const l = linea.trim();
      if (!l) {
        cerrarParrafo();
        cerrarLista();
      } else if (l.startsWith("### ")) {
        cerrarParrafo();
        cerrarLista();
        bloques.push({ tipo: "h3", contenido: l.slice(4) });
      } else if (l.startsWith("## ")) {
        cerrarParrafo();
        cerrarLista();
        bloques.push({ tipo: "h2", contenido: l.slice(3) });
      } else if (/^[-•*]\s+/.test(l)) {
        cerrarParrafo();
        lista.push(l.replace(/^[-•*]\s+/, ""));
      } else {
        cerrarLista();
        parrafo.push(l);
      }
    });
  cerrarParrafo();
  cerrarLista();

  return (
    <div className="space-y-4 text-[15px] leading-relaxed text-marino/85">
      {bloques.map((b, i) => {
        if (b.tipo === "h2") return <h2 key={i} className="pt-4 font-serif text-2xl text-marino">{enLinea(b.contenido, i)}</h2>;
        if (b.tipo === "h3") return <h3 key={i} className="pt-2 font-semibold text-marino">{enLinea(b.contenido, i)}</h3>;
        if (b.tipo === "ul")
          return (
            <ul key={i} className="list-disc space-y-1.5 pl-5 marker:text-ocre">
              {b.contenido.map((item, j) => <li key={j}>{enLinea(item, `${i}-${j}`)}</li>)}
            </ul>
          );
        return <p key={i}>{enLinea(b.contenido, i)}</p>;
      })}
    </div>
  );
}
