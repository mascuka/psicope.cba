import React, { useEffect, useState } from "react";
import { supabase } from "../../supabase/supabaseClient";
import Swal from "sweetalert2";
import { FaChevronLeft, FaChevronRight, FaPlus, FaTrash, FaEdit } from "react-icons/fa";
import PanelPacientes from "./PanelPacientes";
import PanelObrasSociales from "./PanelObrasSociales";
import PanelVentas from "./PanelVentas";
import PanelFinanzas from "./PanelFinanzas";
import "./panelAdmin.css";

const FORM_VACIO = {
  hora_inicio: "",
  hora_fin: "",
  sede_id: "",
  paciente_id: "",
  paciente_nuevo: "",
  fecha_desde: "",
  fecha_hasta: "",
  dias_pago_personalizado: "",
};

export default function PanelAdmin() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [tab, setTab] = useState("calendario");

  const [sedes, setSedes] = useState([]);
  const [pacientes, setPacientes] = useState([]);
  const [horarios, setHorarios] = useState([]); // todos los horarios recurrentes (se filtran en memoria)
  const [monthOffset, setMonthOffset] = useState(0);
  const [diaSeleccionado, setDiaSeleccionado] = useState(null);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [formTurno, setFormTurno] = useState(FORM_VACIO);
  const [usarPacienteNuevo, setUsarPacienteNuevo] = useState(false);
  const [editandoId, setEditandoId] = useState(null);

  useEffect(() => {
    verificarAdmin();
  }, []);

  useEffect(() => {
    if (isAdmin) cargarDatosBase();
  }, [isAdmin]);

  const verificarAdmin = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setChecking(false); return; }
    const { data } = await supabase.from("usuarios").select("rol").eq("id", user.id).single();
    setIsAdmin(data?.rol === "admin");
    setChecking(false);
  };

  const cargarDatosBase = async () => {
    const { data: sedesData } = await supabase.from("sedes").select("*").eq("activa", true).order("nombre");
    setSedes(sedesData || []);

    const { data: pacientesData } = await supabase.from("pacientes").select("id, nombre, apellido").order("nombre");
    setPacientes(pacientesData || []);

    const { data: horariosData } = await supabase
      .from("horarios_pacientes")
      .select("*, sedes(nombre), pacientes(nombre, apellido)")
      .order("hora_inicio");
    setHorarios(horariosData || []);
  };

  const formatFecha = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  const getMesInfo = (offset) => {
    const hoy = new Date();
    const base = new Date(hoy.getFullYear(), hoy.getMonth() + offset, 1);
    const primerDia = new Date(base.getFullYear(), base.getMonth(), 1);
    const ultimoDia = new Date(base.getFullYear(), base.getMonth() + 1, 0);
    const nombre = base.toLocaleDateString("es-AR", { month: "long", year: "numeric" });
    return { primerDia, ultimoDia, nombre };
  };

  // Un horario recurrente "aplica" a una fecha si el día de la semana
  // coincide y la fecha cae dentro del rango desde/hasta (hasta puede ser null)
  const horariosDeLaFecha = (fecha) => {
    const fechaStr = formatFecha(fecha);
    const diaSemana = fecha.getDay();
    return horarios
      .filter(h =>
        h.dia_semana === diaSemana &&
        h.fecha_desde <= fechaStr &&
        (!h.fecha_hasta || h.fecha_hasta >= fechaStr)
      )
      .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
  };

  const abrirNuevo = () => {
    setFormTurno({ ...FORM_VACIO, fecha_desde: formatFecha(diaSeleccionado) });
    setUsarPacienteNuevo(false);
    setEditandoId(null);
    setMostrarForm(true);
  };

  const abrirEdicion = (h) => {
    setFormTurno({
      hora_inicio: h.hora_inicio?.slice(0, 5) || "",
      hora_fin: h.hora_fin?.slice(0, 5) || "",
      sede_id: h.sede_id || "",
      paciente_id: h.paciente_id || "",
      paciente_nuevo: "",
      fecha_desde: h.fecha_desde || "",
      fecha_hasta: h.fecha_hasta || "",
      dias_pago_personalizado: h.dias_pago_personalizado ?? "",
    });
    setUsarPacienteNuevo(false);
    setEditandoId(h.id);
    setMostrarForm(true);
  };

  const guardar = async () => {
    if (!formTurno.hora_inicio || !formTurno.hora_fin || !formTurno.sede_id || !formTurno.fecha_desde) {
      Swal.fire("Faltan datos", "Horario, sede y fecha desde son obligatorios.", "warning");
      return;
    }
    if (!usarPacienteNuevo && !formTurno.paciente_id) {
      Swal.fire("Faltan datos", "Elegí un paciente o cargá uno nuevo.", "warning");
      return;
    }
    if (usarPacienteNuevo && !formTurno.paciente_nuevo.trim()) {
      Swal.fire("Faltan datos", "Escribí el nombre del paciente nuevo.", "warning");
      return;
    }

    let pacienteId = formTurno.paciente_id;

    if (usarPacienteNuevo) {
      const partes = formTurno.paciente_nuevo.trim().split(" ");
      const nombre = partes[0];
      const apellido = partes.slice(1).join(" ") || "";
      const { data, error } = await supabase.from("pacientes").insert([{ nombre, apellido }]).select().single();
      if (error) { Swal.fire("Error", "No se pudo crear el paciente.", "error"); return; }
      pacienteId = data.id;
      setPacientes(prev => [...prev, data]);
    }

    const payload = {
      paciente_id: pacienteId,
      sede_id: formTurno.sede_id,
      dia_semana: diaSeleccionado.getDay(),
      hora_inicio: formTurno.hora_inicio,
      hora_fin: formTurno.hora_fin,
      fecha_desde: formTurno.fecha_desde,
      fecha_hasta: formTurno.fecha_hasta || null,
      dias_pago_personalizado: formTurno.dias_pago_personalizado === "" ? null : Number(formTurno.dias_pago_personalizado),
    };

    let error;
    if (editandoId) {
      ({ error } = await supabase.from("horarios_pacientes").update(payload).eq("id", editandoId));
    } else {
      ({ error } = await supabase.from("horarios_pacientes").insert([payload]));
    }

    if (error) { Swal.fire("Error", "No se pudo guardar.", "error"); return; }

    setMostrarForm(false);
    cargarDatosBase();
  };

  const eliminar = async (id) => {
    const confirm = await Swal.fire({
      title: "¿Eliminar este horario?",
      text: "Se borra por completo, no solo este día.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Eliminar",
      cancelButtonText: "Cancelar",
    });
    if (!confirm.isConfirmed) return;

    const { error } = await supabase.from("horarios_pacientes").delete().eq("id", id);
    if (error) { Swal.fire("Error", "No se pudo eliminar.", "error"); return; }
    cargarDatosBase();
  };

  if (checking) return <div className="panel-admin-container"><p className="panel-loading">Verificando acceso...</p></div>;
  if (!isAdmin) return <div className="panel-admin-container"><p className="panel-loading">No tenés acceso a esta sección.</p></div>;

  const { primerDia, ultimoDia, nombre: nombreMes } = getMesInfo(monthOffset);
  const primerDiaSemanaGrilla = primerDia.getDay() === 0 ? 6 : primerDia.getDay() - 1;
  const diasDelMes = Array.from({ length: ultimoDia.getDate() }, (_, i) => new Date(primerDia.getFullYear(), primerDia.getMonth(), i + 1));
  const celdasVacias = Array.from({ length: primerDiaSemanaGrilla });

  return (
    <div className="panel-admin-container">
      <h1>Panel de Administrador</h1>

      <div className="panel-tabs">
        <button className={tab === "calendario" ? "activa" : ""} onClick={() => setTab("calendario")}>Calendario</button>
        <button className={tab === "pacientes" ? "activa" : ""} onClick={() => setTab("pacientes")}>Pacientes</button>
        <button className={tab === "obras_sociales" ? "activa" : ""} onClick={() => setTab("obras_sociales")}>Obras sociales</button>
        <button className={tab === "finanzas" ? "activa" : ""} onClick={() => setTab("finanzas")}>Finanzas</button>
        <button className={tab === "ventas" ? "activa" : ""} onClick={() => setTab("ventas")}>Ventas</button>
      </div>

      {tab === "finanzas" && <PanelFinanzas />}

      {tab === "ventas" && <PanelVentas />}

      {tab === "obras_sociales" && <PanelObrasSociales />}

      {tab === "pacientes" && <PanelPacientes />}

      {tab === "calendario" && (
        <div className="panel-calendario-stack">
          <div className="panel-calendario-card">
            <div className="panel-mes-nav">
              <button onClick={() => setMonthOffset(m => m - 1)}><FaChevronLeft /></button>
              <p style={{ textTransform: "capitalize" }}>{nombreMes}</p>
              <button onClick={() => setMonthOffset(m => m + 1)}><FaChevronRight /></button>
            </div>

            <div className="panel-dias-nombres">
              {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map(d => <p key={d}>{d}</p>)}
            </div>

            <div className="panel-mes-grid">
              {celdasVacias.map((_, i) => <div key={`v-${i}`} />)}
              {diasDelMes.map((fecha, i) => {
                const cantidad = horariosDeLaFecha(fecha).length;
                const seleccionado = diaSeleccionado && formatFecha(diaSeleccionado) === formatFecha(fecha);
                return (
                  <button
                    key={i}
                    className={`panel-dia-btn ${seleccionado ? "seleccionado" : ""} ${cantidad > 0 ? "con-turnos" : ""}`}
                    onClick={() => { setDiaSeleccionado(fecha); setMostrarForm(false); }}
                  >
                    {fecha.getDate()}
                    {cantidad > 0 && <span className="panel-badge">{cantidad}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {diaSeleccionado && (
            <div className="panel-dia-detalle">
              <div className="panel-dia-detalle-header">
                <h3>{diaSeleccionado.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" })}</h3>
                <button className="panel-btn-agregar" onClick={abrirNuevo}><FaPlus /> Sumar turno</button>
              </div>

              <p className="panel-nota-recurrente">
                Los turnos de acá se repiten todos los {diaSeleccionado.toLocaleDateString("es-AR", { weekday: "long" })} dentro del rango de fechas que definas.
              </p>

              {horariosDeLaFecha(diaSeleccionado).length === 0 && !mostrarForm && (
                <p className="panel-sin-turnos">No hay turnos cargados este día.</p>
              )}

              <div className="panel-turnos-lista">
                {horariosDeLaFecha(diaSeleccionado).map(h => (
                  <div key={h.id} className="panel-turno-item">
                    <div>
                      <strong>{h.hora_inicio?.slice(0, 5)} - {h.hora_fin?.slice(0, 5)}</strong>
                      <p>{h.pacientes?.nombre} {h.pacientes?.apellido}</p>
                      <span className="panel-turno-sede">
                        {h.sedes?.nombre} · desde {h.fecha_desde}{h.fecha_hasta ? ` hasta ${h.fecha_hasta}` : ""}
                      </span>
                    </div>
                    <div className="panel-turno-acciones">
                      <button onClick={() => abrirEdicion(h)}><FaEdit /></button>
                      <button onClick={() => eliminar(h.id)}><FaTrash /></button>
                    </div>
                  </div>
                ))}
              </div>

              {mostrarForm && (
                <div className="panel-form-turno">
                  <h4>{editandoId ? "Editar turno" : "Nuevo turno"}</h4>

                  <div className="panel-form-fila">
                    <label>
                      Hora inicio
                      <input type="time" value={formTurno.hora_inicio} onChange={e => setFormTurno({ ...formTurno, hora_inicio: e.target.value })} />
                    </label>
                    <label>
                      Hora fin
                      <input type="time" value={formTurno.hora_fin} onChange={e => setFormTurno({ ...formTurno, hora_fin: e.target.value })} />
                    </label>
                  </div>

                  <label>
                    Lugar de trabajo
                    <select value={formTurno.sede_id} onChange={e => setFormTurno({ ...formTurno, sede_id: e.target.value })}>
                      <option value="">Elegir sede...</option>
                      {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                    </select>
                  </label>

                  {!usarPacienteNuevo ? (
                    <label>
                      Paciente
                      <select value={formTurno.paciente_id} onChange={e => setFormTurno({ ...formTurno, paciente_id: e.target.value })}>
                        <option value="">Elegir paciente...</option>
                        {pacientes.map(p => <option key={p.id} value={p.id}>{p.nombre} {p.apellido}</option>)}
                      </select>
                    </label>
                  ) : (
                    <label>
                      Nombre del paciente nuevo
                      <input type="text" value={formTurno.paciente_nuevo} onChange={e => setFormTurno({ ...formTurno, paciente_nuevo: e.target.value })} placeholder="Nombre y apellido" />
                    </label>
                  )}

                  <button type="button" className="panel-link-btn" onClick={() => setUsarPacienteNuevo(!usarPacienteNuevo)}>
                    {usarPacienteNuevo ? "Elegir un paciente existente" : "+ Es un paciente nuevo"}
                  </button>

                  <div className="panel-form-fila">
                    <label>
                      Empieza a venir desde
                      <input type="date" value={formTurno.fecha_desde} onChange={e => setFormTurno({ ...formTurno, fecha_desde: e.target.value })} />
                    </label>
                    <label>
                      Hasta (opcional)
                      <input type="date" value={formTurno.fecha_hasta} onChange={e => setFormTurno({ ...formTurno, fecha_hasta: e.target.value })} />
                    </label>
                  </div>

                  <label>
                    Este turno en particular cobra a los X días (opcional, pisa lo del paciente/obra social)
                    <input type="number" value={formTurno.dias_pago_personalizado} onChange={e => setFormTurno({ ...formTurno, dias_pago_personalizado: e.target.value })} placeholder="Ej: 30, 60, 90" />
                  </label>

                  <div className="panel-form-acciones">
                    <button className="panel-btn-guardar" onClick={guardar}>Guardar</button>
                    <button className="panel-btn-cancelar" onClick={() => setMostrarForm(false)}>Cancelar</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}