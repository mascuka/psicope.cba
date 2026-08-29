import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// React Router navega del lado del cliente -- no es una carga de página
// nueva, así que el navegador no resetea el scroll solo. Sin esto,
// cualquier link interno (ej. "Ir a materiales" desde el fondo de Home)
// deja la página nueva en el mismo scrollY de la anterior, en vez de
// arrancar arriba de todo.
//
// OJO: un reset "html, body { overflow-x: hidden }" en footer.css hace
// que <body> termine siendo su propio contenedor de scroll, separado
// del scroll de window/<html> (por eso el scroll-lock de los modales
// hace body{overflow:hidden} y funciona) -- así que window.scrollTo NO
// alcanza acá: hay que resetear scrollTop en body explícitamente. Se
// deja también window.scrollTo/documentElement como red de seguridad
// por si en algún navegador el que scrollea es el otro.
export default function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [pathname]);

  return null;
}
