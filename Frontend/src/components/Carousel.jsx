import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa";
import "./carousel.css";

const COPIAS = 3;

// Carrusel genérico, reusable: recibe las tarjetas ya armadas (cada una
// como hijo directo, con su propio contenido) y solo se encarga de la
// mecánica de desplazamiento -- scroll horizontal nativo (funciona con
// swipe táctil solo, sin JS) más flechas para clickear.
//
// "Infinito" de verdad: las tarjetas originales se repiten 3 veces
// seguidas en el track, arrancamos posicionados en la copia del medio,
// y mientras se hace scroll (por flecha o por swipe) vamos reubicando
// el scroll una copia entera hacia el centro apenas nos acercamos a
// cualquiera de los dos extremos -- sin animación, así es imperceptible.
// El resultado: se puede seguir de largo para cualquier lado sin
// toparse nunca con un final real.
export default function Carousel({ children, ariaLabel }) {
  const wrapRef = useRef(null);
  const trackRef = useRef(null);
  const itemsOriginales = React.Children.toArray(children);
  const cantidad = itemsOriginales.length;
  const [hayOverflow, setHayOverflow] = useState(false);
  const [anchoVisible, setAnchoVisible] = useState(null);

  const habilitarLoop = cantidad > 1;

  const itemsRenderizados = habilitarLoop
    ? Array.from({ length: COPIAS }, (_, copia) =>
        itemsOriginales.map((item, i) =>
          React.cloneElement(item, { key: `copia${copia}-${item.key ?? i}` })
        )
      ).flat()
    : itemsOriginales;

  const centrarEnCopiaDelMedio = () => {
    const track = trackRef.current;
    if (!track || !habilitarLoop) return;
    track.scrollLeft = track.scrollWidth / COPIAS;
  };

  // Angosta el carrusel al múltiplo exacto de (ancho de tarjeta + gap) que
  // entra en el espacio disponible -- así nunca queda una tarjeta a medio
  // cortar asomando en el borde: si no entra completa, no se muestra (se
  // ve como margen prolijo a los costados, no como una línea de la
  // próxima tarjeta). Asume tarjetas de ancho fijo (lo son, ver
  // ".carousel-track .beneficio-item" en home.css), así que medir una
  // alcanza para calcular el resto.
  const recalcularAncho = () => {
    const wrap = wrapRef.current;
    const track = trackRef.current;
    if (!wrap || !track) return;
    const item = track.querySelector(".carousel-item");
    if (!item) return;

    const contenedor = wrap.parentElement;
    const anchoDisponible = contenedor ? contenedor.clientWidth : wrap.clientWidth;
    const anchoItem = item.getBoundingClientRect().width;
    if (anchoItem <= 0 || anchoDisponible <= 0) return;

    const gap = parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap || "0") || 0;

    const cantidadVisible = Math.max(1, Math.floor((anchoDisponible + gap) / (anchoItem + gap)));
    const anchoCalculado = Math.min(cantidadVisible * (anchoItem + gap) - gap, anchoDisponible);
    setAnchoVisible(anchoCalculado);

    // OJO: track.scrollWidth / COPIAS NO da el ancho real de "una sola
    // copia" -- al estar las 3 copias pegadas en una única fila flex, hay
    // 2 gaps de más en las costuras entre copias (y el padding del
    // track) que al dividir por 3 se reparten mal, inflando el resultado
    // unos px. Con pocas tarjetas eso alcanzaba para creer que había
    // overflow cuando en realidad las tarjetas ÚNICAS entraban justas
    // (ver ancho real de una tarjeta + gap, ya medidos arriba).
    const anchoUnaCopiaReal = cantidad * anchoItem + (cantidad - 1) * gap;
    setHayOverflow(anchoUnaCopiaReal > anchoCalculado + 2);
  };

  useLayoutEffect(() => {
    centrarEnCopiaDelMedio();
    recalcularAncho();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cantidad]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const contenedor = wrap.parentElement || wrap;

    const observer = new ResizeObserver(() => {
      recalcularAncho();
      centrarEnCopiaDelMedio();
    });
    observer.observe(contenedor);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cantidad, habilitarLoop]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || !habilitarLoop) return;

    let ticking = false;
    const alScrollear = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const anchoUnaCopia = track.scrollWidth / COPIAS;
        if (anchoUnaCopia > 0) {
          if (track.scrollLeft < anchoUnaCopia * 0.5) {
            track.scrollLeft += anchoUnaCopia;
          } else if (track.scrollLeft > anchoUnaCopia * 1.5) {
            track.scrollLeft -= anchoUnaCopia;
          }
        }
        ticking = false;
      });
    };

    track.addEventListener("scroll", alScrollear, { passive: true });
    return () => track.removeEventListener("scroll", alScrollear);
  }, [habilitarLoop]);

  const desplazar = (direccion) => {
    const track = trackRef.current;
    if (!track) return;
    const item = track.querySelector(".carousel-item");
    const paso = item ? item.getBoundingClientRect().width + 24 : track.clientWidth;
    track.scrollBy({ left: direccion === "next" ? paso : -paso, behavior: "smooth" });
  };

  return (
    <div
      className="carousel-wrap"
      aria-label={ariaLabel}
      ref={wrapRef}
      style={anchoVisible ? { width: anchoVisible, margin: "0 auto" } : undefined}
    >
      {hayOverflow && (
        <button type="button" className="carousel-flecha carousel-flecha-izq" onClick={() => desplazar("prev")} aria-label="Anterior">
          <FaChevronLeft />
        </button>
      )}
      <div className="carousel-track" ref={trackRef}>
        {itemsRenderizados}
      </div>
      {hayOverflow && (
        <button type="button" className="carousel-flecha carousel-flecha-der" onClick={() => desplazar("next")} aria-label="Siguiente">
          <FaChevronRight />
        </button>
      )}
    </div>
  );
}
