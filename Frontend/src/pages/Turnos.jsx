import React, { useEffect, useState } from "react";
import { supabase } from "../supabase/supabaseClient";
import Swal from "sweetalert2";
import { FaMapMarkerAlt, FaWhatsapp, FaEdit, FaPlus, FaTrash, FaExternalLinkAlt } from "react-icons/fa";
import MapaSede from "../components/MapaSede";
import Loader from "../components/Loader";
import "./turnos.css";

const WHATSAPP_NUMERO = "5493513893506"; // sin + ni espacios, formato internacional

const SEDE_VACIA = { nombre: "", direccion: "", link_mapa: "" };
const FORM_VACIO = { nombre: "", apellido: "", telefono: "", email: "", obra_social: "", motivo: "" };

export default function Turnos() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [usuario, setUsuario] = useState(null);

  const [sedes, setSedes] = useState([]);
  const [sedeSeleccionada, setSedeSeleccionada] = useState(null);
  const [editandoSede, setEditandoSede] = useState(false);
  const [creandoSede, setCreandoSede] = useState(false);
  const [formSede, setFormSede] = useState(SEDE_VACIA);

  const [loading, setLoading] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [exito, setExito] = useState(false);

  const [form, setForm] = useState(FORM_VACIO);

  useEffect(() => {
    inicializar();
  }, []);

  const inicializar = async () => {
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUsuario(user);
      const { data: perfil } = await supabase.from("usuarios").select("nombre, email, telefono, rol").eq("id", user.id).single();
      if (perfil) {
        const [nombre, ...resto] = (perfil.nombre || "").split(" ");
        setForm(f => ({
          ...f,
          nombre: nombre || "",
          apellido: resto.join(" ") || "",
          email: perfil.email || user.email || "",
          telefono: perfil.telefono || "",
        }));
        if (perfil.rol === "admin") setIsAdmin(true);
      }
    }

    const { data: sedesData } = await supabase.from("sedes").select("*").eq("activa", true).order("nombre");
    setSedes(sedesData || []);
    if (sedesData && sedesData.length > 0) setSedeSeleccionada(sedesData[0]);

    setLoading(false);
  };

  const handleEnviar = async (e) => {
    e.preventDefault();
    if (!form.nombre || !form.apellido || !form.telefono || !form.email) {
      Swal.fire("Faltan datos", "Nombre, apellido, teléfono y email son obligatorios.", "warning");
      return;
    }

    setEnviando(true);

    const { error } = await supabase.from("solicitudes_turno").insert([{
      nombre: form.nombre,
      apellido: form.apellido,
      telefono: form.telefono,
      email: form.email,
      obra_social: form.obra_social || null,
      motivo: form.motivo || null,
      sede_id: sedeSeleccionada ? sedeSeleccionada.id : null,
      creado_por: usuario ? usuario.id : null,
    }]);

    if (error) {
      setEnviando(false);
      Swal.fire("Error", "No se pudo enviar la solicitud. Probá de nuevo.", "error");
      return;
    }

    // Aviso por email a todos los admins (si falla, no bloqueamos al usuario:
    // la solicitud ya quedó guardada en la base igual)
    try {
      await supabase.functions.invoke("notificar-solicitud-turno", {
        body: {
          nombre: form.nombre,
          apellido: form.apellido,
          telefono: form.telefono,
          email: form.email,
          obra_social: form.obra_social,
          motivo: form.motivo,
          sede_nombre: sedeSeleccionada ? sedeSeleccionada.nombre : null,
        },
      });
    } catch (e) {
      console.warn("No se pudo enviar el email de aviso:", e);
    }

    setEnviando(false);
    setExito(true);
    setForm(FORM_VACIO);
  };

  // ---------- Edición / alta de sedes (admin) ----------
  const abrirEdicionSede = () => {
    setFormSede({ nombre: sedeSeleccionada.nombre, direccion: sedeSeleccionada.direccion, link_mapa: sedeSeleccionada.link_mapa || "" });
    setEditandoSede(true);
    setCreandoSede(false);
  };

  const guardarSede = async () => {
    if (!formSede.nombre) {
      Swal.fire("Faltan datos", "El nombre de la sede es obligatorio.", "warning");
      return;
    }

    if (creandoSede) {
      const { data, error } = await supabase.from("sedes").insert([{ ...formSede, activa: true }]).select().single();
      if (error) { Swal.fire("Error", "No se pudo crear la sede.", "error"); return; }
      const nuevas = [...sedes, data].sort((a, b) => a.nombre.localeCompare(b.nombre));
      setSedes(nuevas);
      setSedeSeleccionada(data);
    } else {
      const { error } = await supabase.from("sedes").update(formSede).eq("id", sedeSeleccionada.id);
      if (error) { Swal.fire("Error", "No se pudo guardar la sede.", "error"); return; }
      const actualizada = { ...sedeSeleccionada, ...formSede };
      setSedes(sedes.map(s => s.id === actualizada.id ? actualizada : s));
      setSedeSeleccionada(actualizada);
    }

    setEditandoSede(false);
    setCreandoSede(false);
    Swal.fire({ icon: "success", title: "Guardado", showConfirmButton: false, timer: 1200 });
  };

  const eliminarSede = async () => {
    const confirm = await Swal.fire({
      title: `¿Eliminar "${sedeSeleccionada.nombre}"?`,
      text: "Esta acción no se puede deshacer.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Eliminar",
      cancelButtonText: "Cancelar",
    });
    if (!confirm.isConfirmed) return;

    const { error } = await supabase.from("sedes").delete().eq("id", sedeSeleccionada.id);
    if (error) {
      Swal.fire("No se pudo eliminar", "Es posible que no tengas permisos para hacer esto, o que la sede tenga turnos u horarios asociados.", "error");
      return;
    }
    const restantes = sedes.filter(s => s.id !== sedeSeleccionada.id);
    setSedes(restantes);
    setSedeSeleccionada(restantes[0] || null);
    setEditandoSede(false);
  };

  if (loading) {
    return <div className="turnos-container"><Loader /></div>;
  }

  // Link para el botón "Ver en Google Maps": el que cargó el admin, o si no
  // hay uno armado automáticamente a partir de la dirección.
  const linkGoogleMaps = sedeSeleccionada?.link_mapa
    ? sedeSeleccionada.link_mapa
    : sedeSeleccionada?.direccion
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(sedeSeleccionada.direccion)}`
      : null;

  // Una sede puede no tener dirección cargada: en ese caso no se muestra ese
  // bloque y solo queda el formulario de datos.
  const mostrarUbicacion = sedeSeleccionada && !editandoSede && sedeSeleccionada.direccion;

  const bloqueFormulario = !exito ? (
    <form className="turnos-form-card turnos-form-reserva" onSubmit={handleEnviar}>
      <h3>Tus datos</h3>

      <div className="turnos-form-fila">
        <input className="turnos-input" placeholder="Nombre *" value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} required />
        <input className="turnos-input" placeholder="Apellido *" value={form.apellido} onChange={e => setForm({ ...form, apellido: e.target.value })} required />
      </div>

      <div className="turnos-form-fila">
        <input className="turnos-input" placeholder="Teléfono *" value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} required />
        <input className="turnos-input" type="email" placeholder="Email *" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required />
      </div>

      <input className="turnos-input" placeholder="Obra social (opcional)" value={form.obra_social} onChange={e => setForm({ ...form, obra_social: e.target.value })} />

      <textarea className="turnos-textarea" placeholder="Contanos brevemente el motivo de la consulta (opcional)" value={form.motivo} onChange={e => setForm({ ...form, motivo: e.target.value })} />

      <button type="submit" className="turnos-btn-confirmar" disabled={enviando}>
        {enviando ? "Enviando..." : "Enviar solicitud"}
      </button>
      <p className="turnos-form-nota">
        Brenda va a revisar tu solicitud y se va a comunicar por teléfono o email para coordinar el turno.
      </p>
    </form>
  ) : (
    <div className="turnos-exito-card">
      <p>¡Listo! Recibimos tus datos. Brenda se va a comunicar a la brevedad para coordinar tu turno.</p>
    </div>
  );

  return (
    <div className="turnos-container">
      <div className="turnos-header">
        <h1>Solicitar un turno</h1>
        <p>Dejanos tus datos y Brenda se va a comunicar para coordinar la consulta.</p>
      </div>

      {/* Selector de sede (si hay más de una configurada) */}
      {sedes.length > 0 && (
        <div className="turnos-sedes-tabs">
          {sedes.map(sede => (
            <button
              key={sede.id}
              className={`turnos-tab-sede ${sedeSeleccionada?.id === sede.id ? "activa" : ""}`}
              onClick={() => { setSedeSeleccionada(sede); setEditandoSede(false); setCreandoSede(false); }}
            >
              {sede.nombre}
            </button>
          ))}
          {isAdmin && (
            <>
              {sedeSeleccionada && (
                <button className="turnos-btn-icono" onClick={abrirEdicionSede} aria-label="Editar sede">
                  <FaEdit />
                </button>
              )}
              <button className="turnos-btn-icono" onClick={() => { setFormSede(SEDE_VACIA); setCreandoSede(true); setEditandoSede(true); }} aria-label="Agregar sede">
                <FaPlus />
              </button>
            </>
          )}
        </div>
      )}

      {/* Formulario de edición / alta de sede */}
      {editandoSede && (
        <div className="turnos-form-card">
          <h3>{creandoSede ? "Nueva sede" : "Editar sede"}</h3>
          <input
            className="turnos-input"
            placeholder="Nombre de la sede"
            value={formSede.nombre}
            onChange={e => setFormSede({ ...formSede, nombre: e.target.value })}
          />
          <input
            className="turnos-input"
            placeholder="Dirección completa (opcional; dejala vacía si no querés mostrar mapa)"
            value={formSede.direccion}
            onChange={e => setFormSede({ ...formSede, direccion: e.target.value })}
          />
          <input
            className="turnos-input"
            placeholder="Link de Google Maps para el botón 'Ver en Google Maps' (opcional, se arma solo con la dirección si lo dejás vacío)"
            value={formSede.link_mapa}
            onChange={e => setFormSede({ ...formSede, link_mapa: e.target.value })}
          />
          <div className="turnos-form-acciones">
            <button className="turnos-btn-confirmar" onClick={guardarSede}>Guardar</button>
            <button className="turnos-btn-secundario" onClick={() => { setEditandoSede(false); setCreandoSede(false); }}>Cancelar</button>
            {!creandoSede && (
              <button className="turnos-btn-icono turnos-btn-eliminar" onClick={eliminarSede} aria-label="Eliminar sede"><FaTrash /></button>
            )}
          </div>
        </div>
      )}

      {/* Formulario de solicitud + ubicación: en desktop van lado a lado
          (datos a la izquierda, mapa a la derecha); en mobile se apilan,
          primero el formulario y después el mapa. */}
      {mostrarUbicacion ? (
        <div className="turnos-layout">
          <div className="turnos-col-form">{bloqueFormulario}</div>
          <div className="turnos-col-mapa">
            <div className="turnos-sede-info turnos-sede-info-standalone">
              <div className="turnos-sede-direccion-fila">
                <p className="turnos-sede-direccion"><FaMapMarkerAlt /> {sedeSeleccionada.direccion}</p>
                {linkGoogleMaps && (
                  <a href={linkGoogleMaps} target="_blank" rel="noopener noreferrer" className="turnos-link-gmaps">
                    Ver en Google Maps <FaExternalLinkAlt />
                  </a>
                )}
              </div>
              <div className="turnos-mapa-wrap">
                <MapaSede direccion={sedeSeleccionada.direccion} nombre={sedeSeleccionada.nombre} />
              </div>
            </div>
          </div>
        </div>
      ) : bloqueFormulario}

      {/* Alternativa WhatsApp */}
      <div className="turnos-whatsapp-alt">
        <p>¿Preferís escribir directamente?</p>
        <a
          href={`https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent("Hola! Quiero consultar sobre un turno.")}`}
          target="_blank"
          rel="noopener noreferrer"
          className="turnos-btn-whatsapp"
        >
          <FaWhatsapp /> Escribinos por WhatsApp
        </a>
      </div>
    </div>
  );
}