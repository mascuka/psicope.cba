import React, { useEffect, useState } from "react";
import { supabase } from "../../supabase/supabaseClient";
import Swal from "sweetalert2";
import { FaSearch, FaPlus, FaTrash, FaEdit, FaFileUpload, FaDownload } from "react-icons/fa";
import { colorPaciente } from "./colores";
import "./pacientesAdmin.css";

const PACIENTE_VACIO = {
  nombre: "", apellido: "", nombre_padre: "", nombre_madre: "",
  telefono: "", email: "", telefono_padre: "", email_padre: "",
  telefono_madre: "", email_madre: "",
  obra_social_id: "", lugar_trabajo_id: "", monto_personalizado: "", dias_pago_personalizado: "",
  activo: true,
};


export default function PanelPacientes() {
  const [pacientes, setPacientes] = useState([]);
  const [obrasSociales, setObrasSociales] = useState([]);
  const [lugaresTrabajo, setLugaresTrabajo] = useState([]);

  const [busqueda, setBusqueda] = useState("");
  const [filtroObraSocial, setFiltroObraSocial] = useState(""); // "" = todas, "particular" o el id de una

  const [pacienteSeleccionado, setPacienteSeleccionado] = useState(null);
  const [subTab, setSubTab] = useState("datos");
  const [editandoDatos, setEditandoDatos] = useState(false);
  const [formPaciente, setFormPaciente] = useState(PACIENTE_VACIO);

  const [mostrarNuevo, setMostrarNuevo] = useState(false);

  const [notas, setNotas] = useState([]);
  const [mostrarNuevaNota, setMostrarNuevaNota] = useState(false);
  const [editandoNotaId, setEditandoNotaId] = useState(null);
  const [formNota, setFormNota] = useState({ titulo: "", descripcion: "" });
  const [archivosNuevos, setArchivosNuevos] = useState([]);
  const [subiendo, setSubiendo] = useState(false);

  useEffect(() => { cargarDatos(); }, []);

  const idSeleccionado = pacienteSeleccionado?.id;
  useEffect(() => {
    if (!idSeleccionado) return;
    document.querySelector(`[data-pac="${idSeleccionado}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [idSeleccionado]);

  const cargarDatos = async () => {
    const { data: pacientesData } = await supabase
      .from("pacientes")
      .select("*, obras_sociales(nombre, precio_hora, dias_pago), lugares_trabajo(nombre, monto, dias_pago)")
      .order("nombre");
    setPacientes(pacientesData || []);

    const { data: obrasData } = await supabase.from("obras_sociales").select("*").order("nombre");
    setObrasSociales(obrasData || []);

    const { data: lugaresData } = await supabase.from("lugares_trabajo").select("*").order("nombre");
    setLugaresTrabajo(lugaresData || []);
  };

  // Sin tildes ni mayúsculas, así "garcia" encuentra a "García".
  const normalizar = (t) => (t || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const pacientesFiltrados = pacientes.filter(p => {
    const pasaBusqueda = !busqueda || normalizar(`${p.nombre} ${p.apellido}`).includes(normalizar(busqueda.trim()));
    const pasaObraSocial = !filtroObraSocial
      || (filtroObraSocial === "particular" ? !p.obra_social_id : p.obra_social_id === filtroObraSocial);
    return pasaBusqueda && pasaObraSocial;
  });

  // ---------- Ficha del paciente ----------
  const abrirNuevoPaciente = () => {
    setFormPaciente(PACIENTE_VACIO);
    setPacienteSeleccionado(null);
    setEditandoDatos(true);
    setMostrarNuevo(true);
  };

  const seleccionarPaciente = async (p) => {
    setPacienteSeleccionado(p);
    setMostrarNuevo(false);
    setEditandoDatos(false);
    setSubTab("datos");
    setFormPaciente({
      nombre: p.nombre || "", apellido: p.apellido || "",
      nombre_padre: p.nombre_padre || "", nombre_madre: p.nombre_madre || "",
      telefono: p.telefono || "", email: p.email || "",
      telefono_padre: p.telefono_padre || "", email_padre: p.email_padre || "",
      telefono_madre: p.telefono_madre || "", email_madre: p.email_madre || "",
      obra_social_id: p.obra_social_id || "",
      lugar_trabajo_id: p.lugar_trabajo_id || "",
      monto_personalizado: p.monto_personalizado ?? "",
      dias_pago_personalizado: p.dias_pago_personalizado ?? "",
      activo: p.activo !== false,
    });
    cargarNotas(p.id);
  };

  // El origen del paciente es UNA de tres cosas -- Particular, una obra
  // social, o un lugar de trabajo (centro) -- nunca dos a la vez. Se
  // maneja como un solo <select> (con un prefijo "os:"/"lt:" para saber
  // cuál es cuál) para que elegir una automáticamente descarte la otra.
  const origenSeleccionado = formPaciente.obra_social_id
    ? `os:${formPaciente.obra_social_id}`
    : formPaciente.lugar_trabajo_id
    ? `lt:${formPaciente.lugar_trabajo_id}`
    : "";

  const cambiarOrigen = (valor) => {
    if (valor.startsWith("os:")) {
      setFormPaciente(f => ({ ...f, obra_social_id: valor.slice(3), lugar_trabajo_id: "" }));
    } else if (valor.startsWith("lt:")) {
      setFormPaciente(f => ({ ...f, obra_social_id: "", lugar_trabajo_id: valor.slice(3) }));
    } else {
      setFormPaciente(f => ({ ...f, obra_social_id: "", lugar_trabajo_id: "" }));
    }
  };

  const esParticular = !formPaciente.obra_social_id && !formPaciente.lugar_trabajo_id;

  // Ningún dato de pago es obligatorio -- puede que todavía no sepa
  // cuánto le va a cobrar a un paciente nuevo, o el precio varíe por
  // sesión. Guarda lo que haya y completa el resto después.
  const guardarPaciente = async () => {
    if (!formPaciente.nombre || !formPaciente.apellido) {
      Swal.fire("Faltan datos", "Nombre y apellido son obligatorios.", "warning");
      return;
    }

    const payload = {
      nombre: formPaciente.nombre,
      apellido: formPaciente.apellido,
      nombre_padre: formPaciente.nombre_padre || null,
      nombre_madre: formPaciente.nombre_madre || null,
      telefono: formPaciente.telefono || null,
      email: formPaciente.email || null,
      telefono_padre: formPaciente.telefono_padre || null,
      email_padre: formPaciente.email_padre || null,
      telefono_madre: formPaciente.telefono_madre || null,
      email_madre: formPaciente.email_madre || null,
      obra_social_id: formPaciente.obra_social_id || null,
      lugar_trabajo_id: formPaciente.lugar_trabajo_id || null,
      monto_personalizado: formPaciente.monto_personalizado === "" ? null : Number(formPaciente.monto_personalizado),
      dias_pago_personalizado: formPaciente.dias_pago_personalizado === "" ? null : Number(formPaciente.dias_pago_personalizado),
    };

    let error, data;
    if (pacienteSeleccionado) {
      ({ error } = await supabase.from("pacientes").update(payload).eq("id", pacienteSeleccionado.id));
    } else {
      ({ data, error } = await supabase.from("pacientes").insert([payload]).select().single());
    }

    if (error) { Swal.fire("Error", "No se pudo guardar el paciente.", "error"); return; }

    setMostrarNuevo(false);
    setEditandoDatos(false);
    await cargarDatos();
    if (data) seleccionarPaciente(data);
  };

  const eliminarPaciente = async (p) => {
    const confirm = await Swal.fire({
      title: `¿Eliminar a ${p.nombre} ${p.apellido}?`,
      text: "Se borran también sus turnos, notas y archivos. No se puede deshacer.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Eliminar",
      cancelButtonText: "Cancelar",
    });
    if (!confirm.isConfirmed) return;

    const { error } = await supabase.from("pacientes").delete().eq("id", p.id);
    if (error) { Swal.fire("Error", "No se pudo eliminar.", "error"); return; }
    if (pacienteSeleccionado?.id === p.id) setPacienteSeleccionado(null);
    cargarDatos();
  };

  // ---------- Notas y archivos ----------
  const cargarNotas = async (pacienteId) => {
    const { data: notasData, error: errorNotas } = await supabase
      .from("paciente_notas")
      .select("*")
      .eq("paciente_id", pacienteId)
      .order("creado_en", { ascending: false });

    if (errorNotas) { console.error("Error cargando notas:", errorNotas); setNotas([]); return; }

    const notasConArchivos = await Promise.all(
      (notasData || []).map(async (nota) => {
        const { data: archivosData, error: errorArchivos } = await supabase
          .from("paciente_archivos")
          .select("*")
          .eq("nota_id", nota.id);

        if (errorArchivos) console.error("Error cargando archivos de la nota", nota.id, errorArchivos);

        const archivosConUrl = await Promise.all(
          (archivosData || []).map(async (a) => {
            const { data: signed, error: errorSigned } = await supabase.storage
              .from("paciente-archivos")
              .createSignedUrl(a.url, 3600);
            if (errorSigned) console.error("Error generando link para", a.nombre_archivo, errorSigned);
            return { ...a, urlFirmada: signed?.signedUrl || null };
          })
        );
        return { ...nota, archivos: archivosConUrl };
      })
    );

    setNotas(notasConArchivos);
  };

  const abrirNuevaNota = () => {
    setFormNota({ titulo: "", descripcion: "" });
    setArchivosNuevos([]);
    setEditandoNotaId(null);
    setMostrarNuevaNota(true);
  };

  const abrirEdicionNota = (n) => {
    setFormNota({ titulo: n.titulo, descripcion: n.descripcion || "" });
    setArchivosNuevos([]);
    setEditandoNotaId(n.id);
    setMostrarNuevaNota(true);
  };

  const guardarNota = async () => {
    if (!formNota.titulo.trim()) {
      Swal.fire("Falta el título", "Ponele un título a la nota.", "warning");
      return;
    }
    setSubiendo(true);

    let notaId = editandoNotaId;

    if (editandoNotaId) {
      const { error } = await supabase
        .from("paciente_notas")
        .update({ titulo: formNota.titulo, descripcion: formNota.descripcion })
        .eq("id", editandoNotaId);
      if (error) { setSubiendo(false); Swal.fire("Error", "No se pudo actualizar la nota.", "error"); return; }
    } else {
      const { data: nota, error } = await supabase
        .from("paciente_notas")
        .insert([{ paciente_id: pacienteSeleccionado.id, titulo: formNota.titulo, descripcion: formNota.descripcion }])
        .select()
        .single();
      if (error) { setSubiendo(false); Swal.fire("Error", "No se pudo crear la nota.", "error"); return; }
      notaId = nota.id;
    }

    for (const archivo of archivosNuevos) {
      const path = `${pacienteSeleccionado.id}/${notaId}/${Date.now()}_${archivo.name}`;
      const { error: errorSubida } = await supabase.storage.from("paciente-archivos").upload(path, archivo);
      if (errorSubida) {
        console.error("Error subiendo archivo", archivo.name, errorSubida);
        Swal.fire("Error", `No se pudo subir "${archivo.name}": ${errorSubida.message}`, "error");
        continue;
      }
      const { error: errorInsert } = await supabase.from("paciente_archivos").insert([{ nota_id: notaId, nombre_archivo: archivo.name, url: path }]);
      if (errorInsert) console.error("Error guardando referencia del archivo", errorInsert);
    }

    setSubiendo(false);
    setMostrarNuevaNota(false);
    setEditandoNotaId(null);
    setFormNota({ titulo: "", descripcion: "" });
    setArchivosNuevos([]);
    cargarNotas(pacienteSeleccionado.id);
  };

  const eliminarNota = async (notaId) => {
    const confirm = await Swal.fire({
      title: "¿Eliminar esta nota?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Eliminar",
      cancelButtonText: "Cancelar",
    });
    if (!confirm.isConfirmed) return;

    await supabase.from("paciente_notas").delete().eq("id", notaId);
    cargarNotas(pacienteSeleccionado.id);
  };

  const eliminarArchivo = async (archivo) => {
    const confirm = await Swal.fire({
      title: `¿Borrar "${archivo.nombre_archivo}"?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Borrar",
      cancelButtonText: "Cancelar",
    });
    if (!confirm.isConfirmed) return;

    await supabase.storage.from("paciente-archivos").remove([archivo.url]);
    await supabase.from("paciente_archivos").delete().eq("id", archivo.id);
    cargarNotas(pacienteSeleccionado.id);
  };

  // La ficha (o el formulario de un paciente nuevo). Se muestra debajo del
  // paciente tocado -- o arriba de todo si es uno nuevo -- para no tener que
  // bajar hasta el final de la lista cuando hay muchos.
  const renderFicha = () => (
        <div className="pac-card pac-detalle">
          {!mostrarNuevo && (
            <div className="pac-sub-tabs">
              <button className={subTab === "datos" ? "activa" : ""} onClick={() => setSubTab("datos")}>Ficha</button>
              <button className={subTab === "notas" ? "activa" : ""} onClick={() => setSubTab("notas")}>Notas y archivos</button>
            </div>
          )}

          {(subTab === "datos" || mostrarNuevo) && (
            <div className="pac-ficha">
              {!editandoDatos && !mostrarNuevo ? (
                <>
                  <div className="pac-ficha-header">
                    <h3>{pacienteSeleccionado.nombre} {pacienteSeleccionado.apellido}</h3>
                    <div className="pac-ficha-header-acciones">
                      <button className="pac-btn-secundario" onClick={() => setEditandoDatos(true)}><FaEdit /> Editar</button>
                    </div>
                  </div>

                  <p><strong>Obra social:</strong> {
                    pacienteSeleccionado.obras_sociales?.nombre
                      ? pacienteSeleccionado.obras_sociales.nombre
                      : pacienteSeleccionado.lugares_trabajo?.nombre
                      ? `Centro: ${pacienteSeleccionado.lugares_trabajo.nombre}`
                      : "Particular"
                  }</p>
                  <p><strong>Paciente:</strong> {formPaciente.telefono || "—"} {formPaciente.email ? `· ${formPaciente.email}` : ""}</p>
                  <p><strong>Padre:</strong> {formPaciente.nombre_padre || "—"} · {formPaciente.telefono_padre || "—"} {formPaciente.email_padre ? `· ${formPaciente.email_padre}` : ""}</p>
                  <p><strong>Madre:</strong> {formPaciente.nombre_madre || "—"} · {formPaciente.telefono_madre || "—"} {formPaciente.email_madre ? `· ${formPaciente.email_madre}` : ""}</p>
                  {esParticular && formPaciente.monto_personalizado !== "" && (
                    <p><strong>Valor de la consulta:</strong> ${Number(formPaciente.monto_personalizado).toLocaleString("es-AR")}</p>
                  )}
                </>
              ) : (
                <>
                  <h3>{mostrarNuevo ? "Nuevo paciente" : "Editar ficha"}</h3>
                  <div className="pac-form-fila">
                    <input placeholder="Nombre" value={formPaciente.nombre} onChange={e => setFormPaciente({ ...formPaciente, nombre: e.target.value })} />
                    <input placeholder="Apellido" value={formPaciente.apellido} onChange={e => setFormPaciente({ ...formPaciente, apellido: e.target.value })} />
                  </div>
                  <div className="pac-form-fila">
                    <input placeholder="Teléfono del paciente" value={formPaciente.telefono} onChange={e => setFormPaciente({ ...formPaciente, telefono: e.target.value })} />
                    <input placeholder="Email del paciente" value={formPaciente.email} onChange={e => setFormPaciente({ ...formPaciente, email: e.target.value })} />
                  </div>
                  <div className="pac-form-fila">
                    <input placeholder="Nombre del padre" value={formPaciente.nombre_padre} onChange={e => setFormPaciente({ ...formPaciente, nombre_padre: e.target.value })} />
                    <input placeholder="Teléfono del padre" value={formPaciente.telefono_padre} onChange={e => setFormPaciente({ ...formPaciente, telefono_padre: e.target.value })} />
                  </div>
                  <input placeholder="Email del padre" value={formPaciente.email_padre} onChange={e => setFormPaciente({ ...formPaciente, email_padre: e.target.value })} />
                  <div className="pac-form-fila">
                    <input placeholder="Nombre de la madre" value={formPaciente.nombre_madre} onChange={e => setFormPaciente({ ...formPaciente, nombre_madre: e.target.value })} />
                    <input placeholder="Teléfono de la madre" value={formPaciente.telefono_madre} onChange={e => setFormPaciente({ ...formPaciente, telefono_madre: e.target.value })} />
                  </div>
                  <input placeholder="Email de la madre" value={formPaciente.email_madre} onChange={e => setFormPaciente({ ...formPaciente, email_madre: e.target.value })} />

                  <select value={origenSeleccionado} onChange={e => cambiarOrigen(e.target.value)}>
                    <option value="">Particular</option>
                    {obrasSociales.map(o => <option key={o.id} value={`os:${o.id}`}>{o.nombre}</option>)}
                    {/* Los centros ya no se usan; solo aparece el que ya tenía el paciente, para no perderlo */}
                    {formPaciente.lugar_trabajo_id && lugaresTrabajo.filter(l => l.id === formPaciente.lugar_trabajo_id).map(l => (
                      <option key={l.id} value={`lt:${l.id}`}>Centro: {l.nombre}</option>
                    ))}
                  </select>

                  {esParticular && (
                    <input
                      type="number"
                      min="0"
                      placeholder="Valor de la consulta (opcional; se sugiere al armar sus turnos)"
                      value={formPaciente.monto_personalizado}
                      onChange={e => setFormPaciente({ ...formPaciente, monto_personalizado: e.target.value })}
                    />
                  )}

                  <div className="pac-form-acciones">
                    <button className="pac-btn-principal" onClick={guardarPaciente}>Guardar</button>
                    <button className="pac-btn-secundario" onClick={() => { setEditandoDatos(false); setMostrarNuevo(false); if (!pacienteSeleccionado) setPacienteSeleccionado(null); }}>Cancelar</button>
                  </div>
                </>
              )}
            </div>
          )}

          {subTab === "notas" && !mostrarNuevo && (
            <div className="pac-notas">
              <div className="pac-notas-header">
                <h4>Notas y archivos</h4>
                <button className="pac-btn-principal" onClick={abrirNuevaNota}><FaPlus /> Nueva nota</button>
              </div>

              {mostrarNuevaNota && (
                <div className="pac-nota-form">
                  <input placeholder="Título" value={formNota.titulo} onChange={e => setFormNota({ ...formNota, titulo: e.target.value })} />
                  <textarea placeholder="Descripción" value={formNota.descripcion} onChange={e => setFormNota({ ...formNota, descripcion: e.target.value })} />
                  <label className="pac-input-archivo">
                    <FaFileUpload /> {archivosNuevos.length > 0 ? `${archivosNuevos.length} archivo(s) elegido(s)` : "Adjuntar archivos"}
                    <input type="file" multiple hidden onChange={e => setArchivosNuevos(Array.from(e.target.files))} />
                  </label>
                  <div className="pac-form-acciones">
                    <button className="pac-btn-principal" onClick={guardarNota} disabled={subiendo}>{subiendo ? "Guardando..." : "Guardar nota"}</button>
                    <button className="pac-btn-secundario" onClick={() => { setMostrarNuevaNota(false); setEditandoNotaId(null); }}>Cancelar</button>
                  </div>
                </div>
              )}

              {notas.length === 0 && <p className="pac-nota">Todavía no hay notas cargadas.</p>}

              <div className="pac-notas-lista">
                {notas.map(n => (
                  <div key={n.id} className="pac-nota-item">
                    <div className="pac-nota-item-header">
                      <strong>{n.titulo}</strong>
                      <div className="pac-turno-acciones">
                        <button onClick={() => abrirEdicionNota(n)}><FaEdit /></button>
                        <button onClick={() => eliminarNota(n.id)}><FaTrash /></button>
                      </div>
                    </div>
                    {n.descripcion && <p>{n.descripcion}</p>}
                    {n.archivos?.length > 0 && (
                      <div className="pac-archivos-lista">
                        {n.archivos.map(a => (
                          a.urlFirmada ? (
                            <span key={a.id} className="pac-archivo-item">
                              <a href={a.urlFirmada} target="_blank" rel="noopener noreferrer">
                                <FaDownload /> {a.nombre_archivo}
                              </a>
                              <button onClick={() => eliminarArchivo(a)} title="Borrar archivo"><FaTrash /></button>
                            </span>
                          ) : (
                            <span key={a.id} className="pac-archivo-error" title="No se pudo generar el link, revisá que el bucket de Storage exista">
                              ⚠ {a.nombre_archivo} (no se pudo abrir)
                              <button onClick={() => eliminarArchivo(a)} title="Borrar archivo"><FaTrash /></button>
                            </span>
                          )
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
  );

  return (
    <div className="pac-container">
      <div className="pac-toolbar">
        <div className="pac-search">
          <FaSearch />
          <input placeholder="Buscar por nombre o apellido..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        </div>
        <select value={filtroObraSocial} onChange={e => setFiltroObraSocial(e.target.value)}>
          <option value="">Todas las obras sociales</option>
          <option value="particular">Particular</option>
          {obrasSociales.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
        </select>
        <button className="pac-btn-principal" onClick={abrirNuevoPaciente}>
          <FaPlus /> Nuevo paciente
        </button>
      </div>

      {mostrarNuevo && renderFicha()}

      <div className="pac-lista">
        {pacientesFiltrados.length === 0 && <p className="pac-nota">No hay pacientes que coincidan.</p>}
        {pacientesFiltrados.map(p => (
          <React.Fragment key={p.id}>
          <div data-pac={p.id} className={`pac-item ${pacienteSeleccionado?.id === p.id ? "seleccionado" : ""}`} onClick={() => (pacienteSeleccionado?.id === p.id && !mostrarNuevo ? setPacienteSeleccionado(null) : seleccionarPaciente(p))}>
            {/* El punto es el mismo color que tiene en el calendario */}
            <div className="pac-item-linea">
              <i className="pac-punto" style={{ background: colorPaciente(p.id).c }} />
              <strong>{p.nombre} {p.apellido}</strong>
              <span>{p.obras_sociales?.nombre || (p.lugares_trabajo?.nombre ? `Centro: ${p.lugares_trabajo.nombre}` : "Particular")}</span>
            </div>
            <button className="pac-btn-eliminar-item" onClick={(e) => { e.stopPropagation(); eliminarPaciente(p); }}><FaTrash /></button>
          </div>
          {pacienteSeleccionado?.id === p.id && !mostrarNuevo && renderFicha()}
          </React.Fragment>
        ))}
      </div>

    </div>
  );
}