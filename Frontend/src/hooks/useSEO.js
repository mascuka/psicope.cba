import { useEffect } from "react";

// Actualiza el título de la pestaña y la meta descripción según la página
// en la que estás -- sin esto, todas las páginas comparten el mismo
// título/descripción del index.html, lo que le resta relevancia de
// búsqueda a cada sección (ej: Quién Soy debería competir por "Brenda
// Grossi psicopedagoga", no solo la Home).
export default function useSEO(titulo, descripcion) {
  useEffect(() => {
    const tituloAnterior = document.title;
    document.title = titulo;

    const metaDescripcion = document.querySelector('meta[name="description"]');
    const descripcionAnterior = metaDescripcion?.getAttribute("content");
    if (metaDescripcion && descripcion) {
      metaDescripcion.setAttribute("content", descripcion);
    }

    return () => {
      document.title = tituloAnterior;
      if (metaDescripcion && descripcionAnterior) {
        metaDescripcion.setAttribute("content", descripcionAnterior);
      }
    };
  }, [titulo, descripcion]);
}
