import React, { useEffect, useState } from "react";
import { supabase } from "../../supabase/supabaseClient";
import Swal from "sweetalert2";
import { FaEdit, FaTrash } from "react-icons/fa";
import "./pacientesAdmin.css";

const OBRA_SOCIAL_VACIA = { nombre: "", precio_hora: "", dias_pago: 30 };

// Pestaña propia para administrar obras sociales -- antes solo se podía
// llegar acá desde adentro de "Pacientes" (un botón "Obras sociales" que
// desplegaba esta misma sección), lo que la dejaba escondida. El CRUD en
// sí es el mismo (misma tabla "obras_sociales"), simplemente ahora tiene
// su propio lugar directo en el panel.
export default function PanelObrasSociales() {
  const [obrasSociales, setObrasSociales] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [formObraSocial, setFormObraSocial] = useState(OBRA_SOCIAL_VACIA);
  const [editandoObraSocialId, setEditandoObraSocialId] = useState(null);

  useEffect(() => { cargarObrasSociales(); }, []);

  const cargarObrasSociales = async () => {
    setCargando(true);
    const { data } = await supabase.from("obras_sociales").select("*").order("nombre");
    setObrasSociales(data || []);
    setCargando(false);
  };

  const abrirNuevaObraSocial = () => {
    setFormObraSocial(OBRA_SOCIAL_VACIA);
    setEditandoObraSocialId(null);
  };

  const editarObraSocial = (o) => {
    setFormObraSocial({ nombre: o.nombre, precio_hora: o.precio_hora ?? "", dias_pago: o.dias_pago ?? 30 });
    setEditandoObraSocialId(o.id);
  };

  const guardarObraSocial = async () => {
    if (!formObraSocial.nombre.trim()) {
      Swal.fire("Falta el nombre", "Ponele un nombre a la obra social.", "warning");
      return;
    }
    const payload = {
      nombre: formObraSocial.nombre,
      precio_hora: formObraSocial.precio_hora === "" ? null : Number(formObraSocial.precio_hora),
      dias_pago: Number(formObraSocial.dias_pago) || 30,
    };

    let error;
    if (editandoObraSocialId) {
      ({ error } = await supabase.from("obras_sociales").update(payload).eq("id", editandoObraSocialId));
    } else {
      ({ error } = await supabase.from("obras_sociales").insert([payload]));
    }
    if (error) { Swal.fire("Error", "No se pudo guardar.", "error"); return; }

    abrirNuevaObraSocial();
    cargarObrasSociales();
  };

  const eliminarObraSocial = async (id) => {
    const confirm = await Swal.fire({
      title: "¿Eliminar esta obra social?",
      text: "Los pacientes que la tenían quedan como Particular, sin precio cargado.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Eliminar",
      cancelButtonText: "Cancelar",
    });
    if (!confirm.isConfirmed) return;

    await supabase.from("pacientes").update({ obra_social_id: null }).eq("obra_social_id", id);
    await supabase.from("obras_sociales").delete().eq("id", id);
    cargarObrasSociales();
  };

  return (
    <div className="pac-container">
      <div className="pac-card pac-obras-sociales">
        <h3>Obras sociales</h3>
        <p className="pac-nota">
          Estas son las únicas opciones que van a aparecer al cargar un paciente, además de "Particular"
          (que no es una obra social real: ahí vos cargás el precio y la frecuencia de pago directo en cada paciente).
          Cambiar el precio o los días de pago acá actualiza el valor sugerido para todos los pacientes de esa obra social.
        </p>

        {cargando ? (
          <p className="pac-nota">Cargando...</p>
        ) : (
          <div className="pac-obras-lista">
            {obrasSociales.map((o) => (
              <div key={o.id} className="pac-obra-item">
                <div>
                  <strong>{o.nombre}</strong>
                  <span>{o.precio_hora ? `$${o.precio_hora}/hora` : "Sin precio"} · cobra a los {o.dias_pago} días</span>
                </div>
                <div className="pac-turno-acciones">
                  <button onClick={() => editarObraSocial(o)}><FaEdit /></button>
                  <button onClick={() => eliminarObraSocial(o.id)}><FaTrash /></button>
                </div>
              </div>
            ))}
            {obrasSociales.length === 0 && <p className="pac-nota">Todavía no cargaste ninguna.</p>}
          </div>
        )}

        <div className="pac-form-fila">
          <input placeholder="Nombre" value={formObraSocial.nombre} onChange={(e) => setFormObraSocial({ ...formObraSocial, nombre: e.target.value })} />
          <input type="number" placeholder="Precio por hora" value={formObraSocial.precio_hora} onChange={(e) => setFormObraSocial({ ...formObraSocial, precio_hora: e.target.value })} />
          <input type="number" placeholder="Cobra a los X días (30, 60, 90...)" value={formObraSocial.dias_pago} onChange={(e) => setFormObraSocial({ ...formObraSocial, dias_pago: e.target.value })} />
        </div>
        <div className="pac-form-acciones">
          <button className="pac-btn-principal" onClick={guardarObraSocial}>{editandoObraSocialId ? "Guardar cambios" : "Agregar"}</button>
          {editandoObraSocialId && <button className="pac-btn-secundario" onClick={abrirNuevaObraSocial}>Cancelar edición</button>}
        </div>
      </div>
    </div>
  );
}
