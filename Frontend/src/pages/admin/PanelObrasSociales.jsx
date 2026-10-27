import React, { useEffect, useState } from "react";
import { supabase } from "../../supabase/supabaseClient";
import Swal from "sweetalert2";
import { FaEdit, FaTrash, FaPlus } from "react-icons/fa";
import "./pacientesAdmin.css";
import "./obrasSociales.css";

// precio_hora = lo que abona la obra social por sesión; dias_pago = a los
// cuántos días de la sesión lo paga. Con eso Finanzas calcula cuánto y
// cuándo se cobra cada sesión de los turnos fijos que paga esa obra social.
const OBRA_SOCIAL_VACIA = { nombre: "", precio_hora: "", dias_pago: 30 };
const PLAZOS = [30, 45, 60, 90, 120];
const formatoMoneda = (n) => `$${Number(n || 0).toLocaleString("es-AR")}`;

export default function PanelObrasSociales() {
  const [obrasSociales, setObrasSociales] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [editandoId, setEditandoId] = useState(null); // id, "nueva" o null
  const [form, setForm] = useState(OBRA_SOCIAL_VACIA);

  const cargarObrasSociales = async () => {
    const { data } = await supabase.from("obras_sociales").select("*").order("nombre");
    setObrasSociales(data || []);
    setCargando(false);
  };

  useEffect(() => {
    supabase.from("obras_sociales").select("*").order("nombre").then(({ data }) => {
      setObrasSociales(data || []);
      setCargando(false);
    });
  }, []);

  const abrirNueva = () => {
    setForm(OBRA_SOCIAL_VACIA);
    setEditandoId("nueva");
  };

  const abrirEdicion = (o) => {
    setForm({ nombre: o.nombre, precio_hora: o.precio_hora ?? "", dias_pago: o.dias_pago ?? 30 });
    setEditandoId(o.id);
  };

  const cerrar = () => { setEditandoId(null); setForm(OBRA_SOCIAL_VACIA); };

  const guardar = async () => {
    if (!form.nombre.trim()) {
      Swal.fire("Falta el nombre", "Ponele un nombre a la obra social.", "warning");
      return;
    }
    const payload = {
      nombre: form.nombre.trim(),
      precio_hora: form.precio_hora === "" ? null : Number(form.precio_hora),
      dias_pago: Number(form.dias_pago) || 30,
    };
    const { error } = editandoId === "nueva"
      ? await supabase.from("obras_sociales").insert([payload])
      : await supabase.from("obras_sociales").update(payload).eq("id", editandoId);
    if (error) { Swal.fire("Error", "No se pudo guardar.", "error"); return; }
    cerrar();
    cargarObrasSociales();
  };

  const eliminar = async (o) => {
    const confirm = await Swal.fire({
      title: `¿Eliminar ${o.nombre}?`,
      text: "Los pacientes que la tenían quedan como Particular, y los turnos que pagaba quedan sin obra social.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Eliminar",
      cancelButtonText: "Cancelar",
    });
    if (!confirm.isConfirmed) return;

    await supabase.from("pacientes").update({ obra_social_id: null }).eq("obra_social_id", o.id);
    await supabase.from("obras_sociales").delete().eq("id", o.id);
    if (editandoId === o.id) cerrar();
    cargarObrasSociales();
  };

  const formulario = (
    <div className="os-form">
      <label>
        Nombre
        <input autoFocus value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Ej: OSDE, APROSS…" />
      </label>
      <label>
        Monto que abona (por sesión)
        <input type="number" min="0" value={form.precio_hora} onChange={(e) => setForm({ ...form, precio_hora: e.target.value })} placeholder="Ej: 15000" />
      </label>
      <div className="os-campo">
        Cada cuánto se cobra
        <div className="os-plazos">
          {PLAZOS.map((d) => (
            <button key={d} type="button" className={Number(form.dias_pago) === d ? "on" : ""} onClick={() => setForm({ ...form, dias_pago: d })}>{d} días</button>
          ))}
          <input
            type="number"
            min="0"
            className={PLAZOS.includes(Number(form.dias_pago)) ? "" : "on"}
            value={PLAZOS.includes(Number(form.dias_pago)) ? "" : form.dias_pago}
            onChange={(e) => setForm({ ...form, dias_pago: e.target.value })}
            placeholder="Otro"
            aria-label="Otra cantidad de días"
          />
        </div>
      </div>
      <div className="os-form-acciones">
        <button className="pac-btn-secundario" onClick={cerrar}>Cancelar</button>
        <button className="pac-btn-principal" onClick={guardar}>{editandoId === "nueva" ? "Agregar" : "Guardar"}</button>
      </div>
    </div>
  );

  return (
    <div className="pac-container">
      <div className="pac-card os-card">
        <div className="os-cab">
          <h3>Obras sociales</h3>
          {editandoId !== "nueva" && <button className="pac-btn-principal" onClick={abrirNueva}><FaPlus /> Nueva</button>}
        </div>
        <p className="pac-nota">
          Lo que abona cada una y cada cuánto paga se usa para calcular en Finanzas cuánto y cuándo se cobra cada sesión.
        </p>

        {editandoId === "nueva" && <div className="os-item editando">{formulario}</div>}

        {cargando ? (
          <p className="pac-nota">Cargando...</p>
        ) : (
          <div className="os-lista">
            {obrasSociales.map((o) => (
              <div key={o.id} className={`os-item ${editandoId === o.id ? "editando" : ""}`}>
                {editandoId === o.id ? formulario : (
                  <>
                    <div className="os-info">
                      <strong>{o.nombre}</strong>
                      <div className="os-datos">
                        <span>{o.precio_hora ? `${formatoMoneda(o.precio_hora)} por sesión` : "Sin monto cargado"}</span>
                        <span>Se cobra a los {o.dias_pago} días</span>
                      </div>
                    </div>
                    <div className="pac-turno-acciones">
                      <button onClick={() => abrirEdicion(o)} aria-label={`Editar ${o.nombre}`}><FaEdit /></button>
                      <button onClick={() => eliminar(o)} aria-label={`Eliminar ${o.nombre}`}><FaTrash /></button>
                    </div>
                  </>
                )}
              </div>
            ))}
            {obrasSociales.length === 0 && editandoId !== "nueva" && <p className="pac-nota">Todavía no cargaste ninguna.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
