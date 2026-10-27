import React, { useEffect, useState } from "react";
import { supabase } from "../../supabase/supabaseClient";
import Agenda from "./Agenda";
import PanelPacientes from "./PanelPacientes";
import PanelObrasSociales from "./PanelObrasSociales";
import PanelVentas from "./PanelVentas";
import PanelFinanzas from "./PanelFinanzas";
import "./panelAdmin.css";

const TABS = [
  ["calendario", "Calendario"],
  ["pacientes", "Pacientes"],
  ["obras_sociales", "Obras sociales"],
  ["finanzas", "Finanzas"],
  ["ventas", "Ventas"],
];

export default function PanelAdmin() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tab, setTab] = useState("calendario");

  useEffect(() => {
    const verificarAdmin = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setChecking(false); return; }
      const { data } = await supabase.from("usuarios").select("rol").eq("id", user.id).single();
      setIsAdmin(data?.rol === "admin");
      setChecking(false);
    };
    verificarAdmin();
  }, []);

  if (checking) return <div className="panel-admin-container"><p className="panel-loading">Verificando acceso...</p></div>;
  if (!isAdmin) return <div className="panel-admin-container"><p className="panel-loading">No tenés acceso a esta sección.</p></div>;

  return (
    // La agenda (semana + calendario al costado) necesita más ancho que el resto.
    <div className={`panel-admin-container ${tab === "calendario" ? "panel-admin-ancho" : ""}`}>
      <h1>Panel de Administrador</h1>

      <div className="panel-tabs">
        {TABS.map(([clave, nombre]) => (
          <button key={clave} className={tab === clave ? "activa" : ""} onClick={() => setTab(clave)}>{nombre}</button>
        ))}
      </div>

      {tab === "calendario" && <Agenda />}

      {tab === "finanzas" && <PanelFinanzas />}

      {tab === "ventas" && <PanelVentas />}

      {tab === "obras_sociales" && <PanelObrasSociales />}

      {tab === "pacientes" && <PanelPacientes />}
    </div>
  );
}
