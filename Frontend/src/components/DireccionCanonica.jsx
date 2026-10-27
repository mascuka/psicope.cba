import { useEffect } from "react";
import { useLocation } from "react-router-dom";

// Todas las rutas sirven el mismo index.html, así que un canonical fijo ahí
// haría que /quien-soy, /materiales, etc. le digan a Google "soy la portada"
// y no las indexe. Por eso el canonical (y og:url) se arma acá, con la ruta
// actual sobre el dominio propio -- nunca con psicope-cba.netlify.app.
const DOMINIO = "https://psicope-cba.com.ar";

function etiqueta(selector, crear) {
  let el = document.head.querySelector(selector);
  if (!el) { el = crear(); document.head.appendChild(el); }
  return el;
}

export default function DireccionCanonica() {
  const { pathname } = useLocation();

  useEffect(() => {
    const ruta = pathname.length > 1 ? pathname.replace(/\/+$/, "") : "/";
    const url = DOMINIO + ruta;
    etiqueta('link[rel="canonical"]', () => Object.assign(document.createElement("link"), { rel: "canonical" })).href = url;
    etiqueta('meta[property="og:url"]', () => {
      const m = document.createElement("meta");
      m.setAttribute("property", "og:url");
      return m;
    }).setAttribute("content", url);
  }, [pathname]);

  return null;
}
