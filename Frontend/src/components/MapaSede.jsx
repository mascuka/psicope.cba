import { consultaMapaGoogle } from "./coordenadasMapa";

/**
 * Mapa embebido de Google Maps (sin API key). Antes era un mapa propio con
 * Leaflet + OpenStreetMap, pero el buscador de OpenStreetMap ubicaba mal las
 * direcciones (ej. "Santa Fe 133" caía en "Rosario de Santa Fe 133", en el
 * Centro, en vez de Alberdi), mientras que Google las encuentra bien.
 *
 * Contras del embed gratis (sin API key): el zoom con la ruedita pide Ctrl,
 * y siempre aparece la ficha del lugar arriba a la izquierda. Lo primero no
 * se puede cambiar desde afuera; la ficha se recorta por CSS (ver
 * .turnos-mapa-iframe en turnos.css).
 */
export default function MapaSede({ direccion, linkMapa, nombre }) {
  const q = consultaMapaGoogle(linkMapa, direccion);

  return (
    <iframe
      className="turnos-mapa-iframe"
      title={`Mapa de ${nombre || direccion}`}
      src={`https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=17&hl=es&output=embed`}
      loading="lazy"
      referrerPolicy="no-referrer-when-downgrade"
      allowFullScreen
    />
  );
}
