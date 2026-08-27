import React from "react";
import ReactDOM from "react-dom/client";
import Swal from "sweetalert2";
import "./index.css";
import App from "./App";
import { BrowserRouter } from "react-router-dom";

// SweetAlert2 con su comportamiento por defecto (heightAuto:true) ajusta
// el alto del <body> apenas se abre un popup, y en páginas largas eso
// hace que el scroll salte de golpe arriba de todo -- pasa con
// CUALQUIER Swal.fire (confirmaciones, alertas de error, el toast de
// "Guardado"), no es algo puntual de una sola pantalla. Se desactiva acá
// una sola vez para que aplique en todo el sitio, sin tener que tocar
// cada uno de los archivos que usan Swal.fire directamente.
const swalFireOriginal = Swal.fire.bind(Swal);
Swal.fire = (...args) => {
  const params =
    args.length === 1 && typeof args[0] === "object" && args[0] !== null
      ? args[0]
      : Swal.argsToParams(args);
  return swalFireOriginal({ heightAuto: false, ...params });
};

ReactDOM.createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>
);
