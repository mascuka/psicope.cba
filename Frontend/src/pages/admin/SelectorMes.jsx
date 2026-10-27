import { FaChevronLeft, FaChevronRight } from "react-icons/fa";
import "./selectorMes.css";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

/* ‹ Octubre 2026 › -- el mes que se mira en Finanzas y Ventas. `mes` va de
   0 a 11. Si no es el mes actual, aparece "Este mes" para volver. */
export default function SelectorMes({ anio, mes, onCambiar }) {
  const hoy = new Date();
  const mover = (d) => {
    const f = new Date(anio, mes + d, 1);
    onCambiar(f.getFullYear(), f.getMonth());
  };
  const esActual = anio === hoy.getFullYear() && mes === hoy.getMonth();

  return (
    <div className="selector-mes">
      <button onClick={() => mover(-1)} aria-label="Mes anterior"><FaChevronLeft /></button>
      <b>{MESES[mes]} <span>{anio}</span></b>
      <button onClick={() => mover(1)} aria-label="Mes siguiente"><FaChevronRight /></button>
      {!esActual && (
        <button className="selector-mes-hoy" onClick={() => onCambiar(hoy.getFullYear(), hoy.getMonth())}>Este mes</button>
      )}
    </div>
  );
}
