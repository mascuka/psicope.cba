import React from "react";
import "./Loader.css";

export default function Loader() {
  return (
    <div className="loader-pagina">
      <div className="loader-spinner" />
      <p className="loader-texto">Cargando...</p>
    </div>
  );
}
