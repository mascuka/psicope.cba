import React, { useEffect, useState } from "react";
import { supabase } from "../../supabase/supabaseClient";
import Swal from "sweetalert2";
import { FaSearch, FaPlus, FaTrash, FaEdit, FaFileUpload, FaDownload, FaCog, FaMoneyBillWave, FaUserSlash, FaUserCheck } from "react-icons/fa";
import "./pacientesAdmin.css";

const PACIENTE_VACIO = {
  nombre: "", apellido: "", nombre_padre: "", nombre_madre: "",
  telefono: "", email: "", telefono_padre: "", email_padre: "",
  telefono_madre: "", email_madre: "",
  obra_social_id: "", monto_personalizado: "", dias_pago_personalizado: "",
  activo: true,
};

const OBRA_SOCIAL_VACIA = { nombre: "", precio_hora: "", dias_pago: 30 };

const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function PanelPacientes() {
  const [pacientes, setPacientes] = useState([]);
  const [obrasSociales, setObrasSociales] = useState([]);

  const [busqueda, setBusqueda] = useState("");
  const [filtroObraSocial, setFiltroObraSocial] = useState("");
  const [filtroFecha, setFiltroFecha] = useState("");
  const [filtroActivo, setFiltroActivo] = useState("activos");

  const [mostrarCobroRapido, setMostrarCobroRapido] = useState(false);
  const [formCobroRapido, setFormCobroRapido] = useState({ monto: "", fecha: hoyISO(), concepto: "Sesión" });
  const [guardandoCobro, setGuardandoCobro] = useState(false);

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

  const [mostrarObrasSociales, setMostrarObrasSociales] = useState(false);
  const [formObraSocial, setFormObraSocial] = useState(OBRA_SOCIAL_VACIA);
  const [editandoObraSocialId, setEditandoObraSocialId] = useState(null);

  useEffect(() => { cargarDatos(); }, []);

  const cargarDatos = async () => {
    const { data: pacientesData } = await supabase
      .from("pacientes")
      .select("*, obras_sociales(nombre, precio_hora, dias_pago)")
      .order("nombre");
    setPacientes(pacientesData || []);

    const { data: obrasData } = await supabase.from("obras_sociales").select("*").order("nombre");
    setObrasSociales(obrasData || []);
  };

  const pacientesFiltrados = pacientes.filter(p => {
    const texto = `${p.nombre} ${p.apellido} ${p.obras_sociales?.nombre || ""}`.toLowerCase();
    const pasaBusqueda = !busqueda || texto.includes(busqueda.toLowerCase());
    const pasaObraSocial = !filtroObraSocial || p.obra_social_id === filtroObraSocial;
    const pasaFecha = !filtroFecha || (p.creado_en && p.creado_en.slice(0, 10) >= filtroFecha);
    const pasaActivo = filtroActivo === "todos" || (filtroActivo === "activos" ? p.activo !== false : p.activo === false);
    return pasaBusqueda && pasaObraSocial && pasaFecha && pasaActivo;
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
    setMostrarCobroRapido(false);
    setFormPaciente({
      nombre: p.nombre || "", apellido: p.apellido || "",
      nombre_padre: p.nombre_padre || "", nombre_madre: p.nombre_madre || "",
      telefono: p.telefono || "", email: p.email || "",
      telefono_padre: p.telefono_padre || "", email_padre: p.email_padre || "",
      telefono_madre: p.telefono_madre || "", email_madre: p.email_madre || "",
      obra_social_id: p.obra_social_id || "",
      monto_personalizado: p.monto_personalizado ?? "",
      dias_pago_personalizado: p.dias_pago_personalizado ?? "",
      activo: p.activo !== false,
    });
    cargarNotas(p.id);
  };

  const cambiarActivo = async (p) => {
    const nuevoEstado = !p.activo;
    const confirm = await Swal.fire({
      title: nuevoEstado ? `¿Reactivar a ${p.nombre}?` : `¿Dar de baja a ${p.nombre}?`,
      text: nuevoEstado
        ? "Vuelve a aparecer en la lista de activos."
        : "No se borra nada -- sigue todo su historial de cobros y notas, pero deja de contar como paciente activo.",
      icon: "question",
      showCancelButton: true,
      confirmButtonColor: "#D48CA6",
      confirmButtonText: nuevoEstado ? "Reactivar" : "Dar de baja",
      cancelButtonText: "Cancelar",
    });
    if (!confirm.isConfirmed) return;

    const { error } = await supabase.from("pacientes").update({ activo: nuevoEstado }).eq("id", p.id);
    if (error) { Swal.fire("Error", "No se pudo actualizar.", "error"); return; }
    if (pacienteSeleccionado?.id === p.id) setFormPaciente(f => ({ ...f, activo: nuevoEstado }));
    cargarDatos();
  };

  // ---------- Cobro rápido (deja registrado un pago sin salir de la ficha) ----------
  const sugerirMontoCobro = () => {
    if (formPaciente.monto_personalizado) return formPaciente.monto_personalizado;
    if (pacienteSeleccionado?.obras_sociales?.precio_hora) return pacienteSeleccionado.obras_sociales.precio_hora;
    return "";
  };

  const abrirCobroRapido = () => {
    setFormCobroRapido({ monto: sugerirMontoCobro(), fecha: hoyISO(), concepto: "Sesión" });
    setMostrarCobroRapido(true);
  };

  const guardarCobroRapido = async () => {
    if (!formCobroRapido.monto || Number(formCobroRapido.monto) <= 0) {
      Swal.fire("Falta el monto", "Cargá cuánto pagó.", "warning");
      return;
    }
    setGuardandoCobro(true);
    const { error } = await supabase.from("cobros").insert([{
      paciente_id: pacienteSeleccionado.id,
      concepto: formCobroRapido.concepto || null,
      monto: Number(formCobroRapido.monto),
      fecha: formCobroRapido.fecha || hoyISO(),
    }]);
    setGuardandoCobro(false);
    if (error) { Swal.fire("Error", "No se pudo registrar el cobro.", "error"); return; }
    setMostrarCobroRapido(false);
    Swal.fire({ icon: "success", title: "Cobro registrado", showConfirmButton: false, timer: 1200, heightAuto: false });
  };

  const esParticular = !formPaciente.obra_social_id;

  const guardarPaciente = async () => {
    if (!formPaciente.nombre || !formPaciente.apellido) {
      Swal.fire("Faltan datos", "Nombre y apellido son obligatorios.", "warning");
      return;
    }
    if (esParticular && (formPaciente.monto_personalizado === "" || formPaciente.dias_pago_personalizado === "")) {
      Swal.fire("Faltan datos", "Como no tiene obra social, completá el precio y cada cuántos días cobra.", "warning");
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

  // ---------- Obras sociales ----------
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
    cargarDatos();
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
    cargarDatos();
  };

  return (
    <div className="pac-container">
      <div className="pac-toolbar">
        <div className="pac-search">
          <FaSearch />
          <input placeholder="Buscar por nombre o apellido..." value={busqueda} onChange={e => setBusqueda(e.target.value)} />
        </div>
        <select value={filtroObraSocial} onChange={e => setFiltroObraSocial(e.target.value)}>
          <option value="">Todas las obras sociales</option>
          {obrasSociales.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
        </select>
        <select value={filtroActivo} onChange={e => setFiltroActivo(e.target.value)}>
          <option value="activos">Activos</option>
          <option value="inactivos">Dados de baja</option>
          <option value="todos">Todos</option>
        </select>
        <label className="pac-fecha-label">
          Alta desde
          <input type="date" value={filtroFecha} onChange={e => setFiltroFecha(e.target.value)} />
        </label>
        <button className="pac-btn-secundario" onClick={() => setMostrarObrasSociales(!mostrarObrasSociales)}>
          <FaCog /> Obras sociales
        </button>
        <button className="pac-btn-principal" onClick={abrirNuevoPaciente}>
          <FaPlus /> Nuevo paciente
        </button>
      </div>

      {mostrarObrasSociales && (
        <div className="pac-card pac-obras-sociales">
          <h3>Obras sociales</h3>
          <p className="pac-nota">
            Estas son las únicas opciones que van a aparecer al cargar un paciente, además de "Particular"
            (que no es una obra social real: ahí vos cargás el precio y la frecuencia de pago directo en cada paciente).
            Cambiar el precio o los días de pago acá actualiza el valor sugerido para todos los pacientes de esa obra social.
          </p>

          <div className="pac-obras-lista">
            {obrasSociales.map(o => (
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

          <div className="pac-form-fila">
            <input placeholder="Nombre" value={formObraSocial.nombre} onChange={e => setFormObraSocial({ ...formObraSocial, nombre: e.target.value })} />
            <input type="number" placeholder="Precio por hora" value={formObraSocial.precio_hora} onChange={e => setFormObraSocial({ ...formObraSocial, precio_hora: e.target.value })} />
            <input type="number" placeholder="Cobra a los X días (30, 60, 90...)" value={formObraSocial.dias_pago} onChange={e => setFormObraSocial({ ...formObraSocial, dias_pago: e.target.value })} />
          </div>
          <div className="pac-form-acciones">
            <button className="pac-btn-principal" onClick={guardarObraSocial}>{editandoObraSocialId ? "Guardar cambios" : "Agregar"}</button>
            {editandoObraSocialId && <button className="pac-btn-secundario" onClick={abrirNuevaObraSocial}>Cancelar edición</button>}
          </div>
        </div>
      )}

      <div className="pac-lista">
        {pacientesFiltrados.length === 0 && <p className="pac-nota">No hay pacientes que coincidan.</p>}
        {pacientesFiltrados.map(p => (
          <div key={p.id} className={`pac-item ${pacienteSeleccionado?.id === p.id ? "seleccionado" : ""} ${p.activo === false ? "pac-item-inactivo" : ""}`} onClick={() => seleccionarPaciente(p)}>
            <div>
              <strong>{p.nombre} {p.apellido}</strong>
              <span>
                {p.obras_sociales?.nombre || "Particular"}
                {p.activo === false && <span className="pac-tag-inactivo">Dado de baja</span>}
              </span>
            </div>
            <button className="pac-btn-eliminar-item" onClick={(e) => { e.stopPropagation(); eliminarPaciente(p); }}><FaTrash /></button>
          </div>
        ))}
      </div>

      {(pacienteSeleccionado || mostrarNuevo) && (
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
                    <h3>{pacienteSeleccionado.nombre} {pacienteSeleccionado.apellido} {formPaciente.activo === false && <span className="pac-tag-inactivo">Dado de baja</span>}</h3>
                    <div className="pac-ficha-header-acciones">
                      <button className="pac-btn-principal" onClick={abrirCobroRapido}><FaMoneyBillWave /> Registrar cobro</button>
                      <button className="pac-btn-secundario" onClick={() => cambiarActivo(pacienteSeleccionado)}>
                        {formPaciente.activo === false ? <><FaUserCheck /> Reactivar</> : <><FaUserSlash /> Dar de baja</>}
                      </button>
                      <button className="pac-btn-secundario" onClick={() => setEditandoDatos(true)}><FaEdit /> Editar</button>
                    </div>
                  </div>

                  {mostrarCobroRapido && (
                    <div className="pac-nota-form">
                      <div className="pac-form-fila">
                        <input type="number" placeholder="Monto cobrado" value={formCobroRapido.monto} onChange={e => setFormCobroRapido({ ...formCobroRapido, monto: e.target.value })} />
                        <input type="date" value={formCobroRapido.fecha} onChange={e => setFormCobroRapido({ ...formCobroRapido, fecha: e.target.value })} />
                      </div>
                      <input placeholder="Concepto (ej: Sesión)" value={formCobroRapido.concepto} onChange={e => setFormCobroRapido({ ...formCobroRapido, concepto: e.target.value })} />
                      <div className="pac-form-acciones">
                        <button className="pac-btn-principal" onClick={guardarCobroRapido} disabled={guardandoCobro}>{guardandoCobro ? "Guardando..." : "Guardar cobro"}</button>
                        <button className="pac-btn-secundario" onClick={() => setMostrarCobroRapido(false)}>Cancelar</button>
                      </div>
                    </div>
                  )}

                  <p><strong>Obra social:</strong> {pacienteSeleccionado.obras_sociales?.nombre || "Particular"}</p>
                  <p><strong>Paciente:</strong> {formPaciente.telefono || "—"} {formPaciente.email ? `· ${formPaciente.email}` : ""}</p>
                  <p><strong>Padre:</strong> {formPaciente.nombre_padre || "—"} · {formPaciente.telefono_padre || "—"} {formPaciente.email_padre ? `· ${formPaciente.email_padre}` : ""}</p>
                  <p><strong>Madre:</strong> {formPaciente.nombre_madre || "—"} · {formPaciente.telefono_madre || "—"} {formPaciente.email_madre ? `· ${formPaciente.email_madre}` : ""}</p>
                  <p><strong>Precio:</strong> {formPaciente.monto_personalizado ? `$${formPaciente.monto_personalizado} (particular)` : `usa el de ${pacienteSeleccionado.obras_sociales?.nombre || "la obra social"}`}</p>
                  <p><strong>Cobra a los:</strong> {formPaciente.dias_pago_personalizado ? `${formPaciente.dias_pago_personalizado} días (particular)` : `${pacienteSeleccionado.obras_sociales?.dias_pago || 30} días (de la obra social)`}</p>
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

                  <select value={formPaciente.obra_social_id} onChange={e => setFormPaciente({ ...formPaciente, obra_social_id: e.target.value })}>
                    <option value="">Particular (precio propio)</option>
                    {obrasSociales.map(o => <option key={o.id} value={o.id}>{o.nombre}</option>)}
                  </select>

                  <div className="pac-form-fila">
                    <input
                      type="number"
                      placeholder={esParticular ? "Precio (obligatorio)" : "Precio particular (opcional, pisa el de la obra social)"}
                      value={formPaciente.monto_personalizado}
                      onChange={e => setFormPaciente({ ...formPaciente, monto_personalizado: e.target.value })}
                    />
                    <input
                      type="number"
                      placeholder={esParticular ? "Cobra a los X días (obligatorio)" : "Cobra a los X días (opcional, pisa el de la obra social)"}
                      value={formPaciente.dias_pago_personalizado}
                      onChange={e => setFormPaciente({ ...formPaciente, dias_pago_personalizado: e.target.value })}
                    />
                  </div>

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
      )}
    </div>
  );
}