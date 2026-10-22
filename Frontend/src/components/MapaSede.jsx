import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import iconoMarcador from "leaflet/dist/images/marker-icon.png";
import iconoMarcador2x from "leaflet/dist/images/marker-icon-2x.png";
import iconoSombra from "leaflet/dist/images/marker-shadow.png";
import { coordenadasDeLinkGoogle } from "./coordenadasMapa";

// Leaflet busca las imágenes del marcador con rutas relativas que no
// resuelven con bundlers como Vite; hay que decirle explícitamente cuáles son.
const iconoDefault = L.icon({
  iconUrl: iconoMarcador,
  iconRetinaUrl: iconoMarcador2x,
  shadowUrl: iconoSombra,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

/**
 * Mapa propio (Leaflet + OpenStreetMap, sin API key) en vez de un iframe de
 * Google Maps: el zoom con la ruedita del mouse funciona directo, sin pedir
 * Ctrl -- eso es un comportamiento que Google fuerza dentro de sus iframes
 * embebidos y que no se puede desactivar desde afuera, por tratarse de
 * contenido de otro dominio. Acá el mapa corre en nuestra propia página, así
 * que respeta el scroll normal como cualquier mapa interactivo.
 *
 * Si la sede tiene un link largo de Google Maps, el pin sale de las
 * coordenadas del link (lo más preciso). Si no, geocodifica la dirección con
 * Nominatim (el buscador gratuito de OpenStreetMap).
 */

// Córdoba Capital (izq, arriba, der, abajo): todas las sedes están acá, así
// que se busca primero solo dentro de este recuadro. Sin esto, "Santa Fe 133"
// a secas caía en cualquier calle Santa Fe del país (ej. Mendoza).
const VIEWBOX_CORDOBA = "-64.33,-31.30,-64.05,-31.53";

const buscarEnNominatim = async (params) => {
  const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=ar&${params}`);
  const resultados = await resp.json();
  return resultados?.[0] ? { lat: resultados[0].lat, lon: resultados[0].lon } : null;
};

// Primero dentro de Córdoba Capital; si no aparece ahí, el resto de Argentina.
const geocodificar = async (direccion) => {
  const q = encodeURIComponent(direccion);
  return (
    (await buscarEnNominatim(`q=${encodeURIComponent(`${direccion}, Córdoba`)}&viewbox=${VIEWBOX_CORDOBA}&bounded=1`)) ||
    (await buscarEnNominatim(`q=${q}&viewbox=${VIEWBOX_CORDOBA}&bounded=1`)) ||
    (await buscarEnNominatim(`q=${q}&viewbox=${VIEWBOX_CORDOBA}`))
  );
};

export default function MapaSede({ direccion, linkMapa, nombre }) {
  const contenedorRef = useRef(null);
  const mapaRef = useRef(null);
  const [estado, setEstado] = useState("cargando"); // cargando | listo | error

  useEffect(() => {
    let cancelado = false;

    const iniciar = async () => {
      setEstado("cargando");
      try {
        const coords = coordenadasDeLinkGoogle(linkMapa) || (await geocodificar(direccion));
        if (cancelado) return;

        if (!coords) {
          setEstado("error");
          return;
        }

        const { lat, lon } = coords;

        if (mapaRef.current) {
          mapaRef.current.remove();
          mapaRef.current = null;
        }

        const mapa = L.map(contenedorRef.current, { scrollWheelZoom: true }).setView([lat, lon], 16);

        // Tiles estándar de OpenStreetMap: gratis, sin API key y sin
        // depender de un proveedor externo que pueda sumar requisitos
        // (CARTO empezó a pedir API key incluso en su plan gratuito, lo que
        // rompía el mapa mostrando tiles con el texto "API KEY REQUIRED").
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          subdomains: "abc",
          maxZoom: 19,
        }).addTo(mapa);

        L.marker([lat, lon], { icon: iconoDefault }).addTo(mapa).bindPopup(nombre || direccion);

        mapaRef.current = mapa;
        setEstado("listo");

        // Leaflet calcula el tamaño del mapa en el momento exacto en que se
        // crea: si en ese instante el contenedor todavía mide 0 (layouts con
        // flex/grid que recién terminan de acomodarse después del primer
        // render) el mapa queda invisible para siempre. invalidateSize()
        // fuerza a Leaflet a releer el tamaño real; lo hacemos ahora, un
        // instante después, y también cada vez que el contenedor cambia de
        // tamaño (por ejemplo cuando el layout termina de calcular el alto
        // igualado con el formulario).
        requestAnimationFrame(() => mapa.invalidateSize());
        const resizeObserver = new ResizeObserver(() => mapa.invalidateSize());
        resizeObserver.observe(contenedorRef.current);
        mapaRef.current._resizeObserver = resizeObserver;
      } catch (err) {
        console.error("No se pudo geocodificar/mostrar el mapa:", err);
        if (!cancelado) setEstado("error");
      }
    };

    iniciar();

    return () => {
      cancelado = true;
      if (mapaRef.current) {
        mapaRef.current._resizeObserver?.disconnect();
        mapaRef.current.remove();
        mapaRef.current = null;
      }
    };
  }, [direccion, linkMapa, nombre]);

  if (estado === "error") {
    return <div className="turnos-mapa-error">No pudimos ubicar esta dirección en el mapa automáticamente.</div>;
  }

  return (
    <div className="turnos-mapa-leaflet-wrap">
      {estado === "cargando" && <div className="turnos-mapa-cargando">Cargando mapa...</div>}
      <div ref={contenedorRef} className="turnos-mapa-leaflet" />
    </div>
  );
}
