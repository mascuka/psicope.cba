import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../../supabase/supabaseClient";
import Swal from "sweetalert2";
import { FaChevronLeft, FaChevronRight, FaSearch, FaTimes, FaEdit, FaTrash, FaPlus } from "react-icons/fa";
import "./agenda.css";

/*
 * Agenda del panel admin, en dos partes:
 * 1. LA SEMANA (centro): una grilla de lunes a sábado por horario, con los
 *    turnos fijos (horarios_pacientes, se repiten cada semana) y lo anotado
 *    con hora (agenda_eventos). Lo anotado sin hora va en "Todo el día".
 *    Tocando un bloque se edita; tocando un hueco, se anota algo a esa hora.
 *    En el celular, un día a la vez (pestañas Lun…Sáb).
 * 2. EL CALENDARIO (costado; en el celular, abajo): de a dos meses, con los
 *    doce en dos filas de seis. Tocando un día, la grilla salta a esa semana
 *    y se abre un globo para anotar cualquier cosa o configurar turnos fijos.
 *    Debajo: el buscador (apaga los días sin coincidencias) y las próximas
 *    fechas.
 * - Colores: cada paciente tiene el suyo (sus turnos fijos y lo anotado con
 *   él); lo que no es de un paciente es "Otro", dorado y con estrellita.
 * - En el calendario, el día se pinta con el color de lo anotado: con dos
 *   cosas se parte en diagonal, con tres en franjas; lo de varios días va más
 *   suave y punteado. El puntito abajo del número = ese día hay turnos fijos.
 */

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS_LARGO = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const DIAS_CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

/* Dos clases de cosas: las de un paciente (sus turnos fijos y lo anotado con
   él) van con el color de ese paciente; el resto es "Otro": dorado y con
   estrellita, y el título dice qué es. c = punto/borde, f = fondo, t = texto. */
const OTRO = { c: "#C9A227", f: "#FAF0CC", t: "#6E5300" };

// Un color por paciente, sacado de su id: siempre el mismo para el mismo
// paciente aunque se sumen otros. Se salta la franja de los amarillos
// (35°–70°), que queda para "Otro".
const coloresPaciente = {};
function colorPaciente(id) {
  if (!id) return OTRO;
  if (coloresPaciente[id]) return coloresPaciente[id];
  // FNV-1a + una mezcla final: ids parecidos dan tonos bien distintos.
  let hash = 2166136261;
  for (const ch of String(id)) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619);
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  hash = (hash ^ (hash >>> 16)) >>> 0;
  const base = (hash % 1000) / 1000 * 325;
  const h = Math.round(base < 35 ? base : base + 35);
  const s = 42 + ((hash >> 10) % 3) * 9; // tres saturaciones, para separar más los tonos vecinos
  return (coloresPaciente[id] = { c: `hsl(${h} ${s}% 55%)`, f: `hsl(${h} ${s + 18}% 92%)`, t: `hsl(${h} ${s}% 26%)` });
}
const colorEvento = (ev) => colorPaciente(ev.paciente_id);

const PX_HORA = 52; // alto de una hora en la grilla de la semana
const DURACION_DEFECTO = 45; // minutos, para lo anotado con hora pero sin hora de fin

const claveDia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const deClave = (k) => { const [a, m, d] = k.split("-").map(Number); return new Date(a, m - 1, d); };
const masDias = (k, n) => { const f = deClave(k); f.setDate(f.getDate() + n); return claveDia(f); };
const lunesDe = (k) => masDias(k, -((deClave(k).getDay() + 6) % 7));
const hoyClave = () => claveDia(new Date());
const aMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const aHora = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
const normalizar = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const nombrePaciente = (p) => (p ? `${p.nombre || ""} ${p.apellido || ""}`.trim() : "");
const capital = (s) => s[0].toUpperCase() + s.slice(1);
const mesCorto = (f) => MESES[f.getMonth()].slice(0, 3);

function faltaTexto(k) {
  const dd = Math.round((deClave(k) - deClave(hoyClave())) / 864e5);
  if (dd === 0) return "hoy";
  if (dd === 1) return "mañana";
  if (dd > 1) return `en ${dd} días`;
  return dd === -1 ? "ayer" : `hace ${-dd} días`;
}

function rangoTxt(desde, hasta) {
  const a = deClave(desde), b = deClave(hasta);
  return a.getMonth() === b.getMonth() ? `${a.getDate()}–${b.getDate()} ${mesCorto(a)}` : `${a.getDate()} ${mesCorto(a)}–${b.getDate()} ${mesCorto(b)}`;
}

// Variables CSS con los colores (sufijo "" para un solo color, 1/2/3 para
// cada parte de un día partido).
const varsColor = (t, i = "") => ({ [`--c${i}`]: t.c, [`--f${i}`]: t.f, [`--t${i}`]: t.t });

// La estrellita de "Otro" (lo único con ícono).
function Estrella({ className = "" }) {
  return (
    <svg className={`cal-ti ${className}`} viewBox="0 0 10 10" fill="currentColor" aria-hidden="true">
      <path d="M5 .5l1.4 2.9 3.1.4-2.3 2.2.6 3.1L5 7.6 2.2 9.1l.6-3.1L.5 3.8l3.1-.4z" />
    </svg>
  );
}

/* Bloques que se pisan el mismo día van lado a lado: cada grupo de bloques
   encadenados se reparte en carriles. Devuelve [{ ...item, carril, carriles }]. */
function carriles(items) {
  const orden = [...items].sort((a, b) => a.ini - b.ini || b.fin - a.fin);
  const salida = [];
  let grupo = [], finGrupo = -1;
  const cerrar = () => {
    const finCarril = [];
    grupo.forEach((it) => {
      let c = finCarril.findIndex((f) => f <= it.ini);
      if (c < 0) c = finCarril.length;
      finCarril[c] = it.fin;
      it.carril = c;
    });
    grupo.forEach((it) => salida.push({ ...it, carriles: finCarril.length }));
    grupo = [];
  };
  orden.forEach((it) => {
    if (grupo.length && it.ini >= finGrupo) cerrar();
    grupo.push(it);
    finGrupo = Math.max(finGrupo, it.fin);
  });
  if (grupo.length) cerrar();
  return salida;
}

const EVENTO_VACIO = { id: null, fecha: "", titulo: "", detalle: "", hora: "", hora_fin: "", paciente_id: "", varios: false, hasta: "" };
const FIJO_VACIO = { id: null, hora_inicio: "", hora_fin: "", sede_id: "", paciente_id: "", paciente_nuevo: "", fecha_desde: "", fecha_hasta: "", dias_pago_personalizado: "" };

/* Buscador de pacientes: se escribe y aparecen los que coinciden. Si se
   permite, la última opción crea un paciente nuevo con lo escrito. */
function BuscarPaciente({ pacientes, pacienteId, onElegir, nuevo, onNuevo }) {
  const [texto, setTexto] = useState("");
  const [abierto, setAbierto] = useState(false);
  const elegido = pacientes.find((p) => p.id === pacienteId);

  if (elegido || nuevo) {
    return (
      <div className="cal-pac-chip">
        <span>{elegido ? nombrePaciente(elegido) : nuevo}</span>
        {nuevo && <small>nuevo</small>}
        <button type="button" onClick={() => { onElegir(""); onNuevo?.(""); setTexto(""); }} aria-label="Quitar paciente"><FaTimes /></button>
      </div>
    );
  }

  const q = normalizar(texto.trim());
  const opciones = (q ? pacientes.filter((p) => normalizar(nombrePaciente(p)).includes(q)) : pacientes).slice(0, 6);
  // onMouseDown con preventDefault: así el input no pierde el foco (y la lista
  // no se cierra) antes de que llegue el clic.
  const sinBlur = (e) => e.preventDefault();

  return (
    <div className="cal-pac">
      <FaSearch />
      <input
        value={texto}
        onChange={(e) => { setTexto(e.target.value); setAbierto(true); }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setAbierto(false)}
        placeholder="Buscar paciente…"
        autoComplete="off"
      />
      {abierto && (opciones.length > 0 || (onNuevo && q)) && (
        <div className="cal-pac-lista">
          {opciones.map((p) => (
            <button type="button" key={p.id} onMouseDown={sinBlur} onClick={() => { onElegir(p.id); setTexto(""); }}>
              {nombrePaciente(p)}
            </button>
          ))}
          {onNuevo && q && (
            <button type="button" className="nuevo" onMouseDown={sinBlur} onClick={() => onNuevo(texto.trim())}>
              <FaPlus /> Paciente nuevo: «{texto.trim()}»
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function Agenda() {
  const kHoy = hoyClave();
  const [foco, setFoco] = useState(kHoy); // el día elegido: define la semana de la grilla
  const [vista, setVista] = useState(() => { const h = new Date(); return { anio: h.getFullYear(), mes: Math.min(h.getMonth(), 10) }; });

  const [sedes, setSedes] = useState([]);
  const [pacientes, setPacientes] = useState([]);
  const [horarios, setHorarios] = useState([]);
  const [eventos, setEventos] = useState([]);
  const [proximos, setProximos] = useState([]);
  const [faltaTabla, setFaltaTabla] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  const [sel, setSel] = useState(null); // día con el globo abierto ("2026-11-03")
  const [modo, setModo] = useState("anotar"); // anotar | fijo
  const [form, setForm] = useState(EVENTO_VACIO);
  const [formFijo, setFormFijo] = useState(FIJO_VACIO);
  const popRef = useRef(null);
  const tituloRef = useRef(null);
  // Al lado de qué se abre el globo: { el, y } (y = altura del clic dentro de
  // una columna de la grilla, para que apunte a la hora tocada).
  const anclaRef = useRef(null);

  const semana = lunesDe(foco);
  // Se trae lo anotado del año del calendario y de la semana de la grilla
  // (que puede caer en otro año, ej. del 28 dic al 3 ene).
  const rangoIni = [`${vista.anio}-01-01`, semana].sort()[0];
  const rangoFin = [`${vista.anio}-12-31`, masDias(semana, 6)].sort()[1];

  useEffect(() => {
    const cargar = async () => {
      const [{ data: s }, { data: p }, { data: h }] = await Promise.all([
        supabase.from("sedes").select("*").eq("activa", true).order("nombre"),
        supabase.from("pacientes").select("id, nombre, apellido").order("nombre"),
        supabase.from("horarios_pacientes").select("*, sedes(nombre), pacientes(nombre, apellido)").order("hora_inicio"),
      ]);
      setSedes(s || []);
      setPacientes(p || []);
      setHorarios(h || []);
    };
    cargar();
  }, []);

  const cargarHorarios = async () => {
    const { data } = await supabase.from("horarios_pacientes").select("*, sedes(nombre), pacientes(nombre, apellido)").order("hora_inicio");
    setHorarios(data || []);
  };

  const cargarEventos = async () => {
    const { data, error } = await supabase
      .from("agenda_eventos")
      .select("*, pacientes(nombre, apellido)")
      .lte("fecha", rangoFin)
      .or(`fecha.gte.${rangoIni},hasta.gte.${rangoIni}`)
      .order("fecha")
      .order("hora", { nullsFirst: true });
    setFaltaTabla(!!error);
    setEventos(data || []);
  };

  const cargarProximos = async () => {
    const { data } = await supabase
      .from("agenda_eventos")
      .select("*, pacientes(nombre, apellido)")
      .or(`fecha.gte.${kHoy},hasta.gte.${kHoy}`)
      .order("fecha")
      .limit(6);
    setProximos(data || []);
  };

  // Se recarga solo cuando cambia el rango de fechas (las funciones de carga
  // se recrean en cada render, pero leen siempre el rango actual).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { cargarEventos(); }, [rangoIni, rangoFin]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { cargarProximos(); }, []);

  const recargarEventos = () => { cargarEventos(); cargarProximos(); };

  // Lo anotado, por día (lo de varios días aparece en cada día del rango).
  const eventosPorDia = useMemo(() => {
    const idx = {};
    for (const ev of eventos) {
      let k = ev.fecha < rangoIni ? rangoIni : ev.fecha;
      const hasta = [ev.hasta || ev.fecha, rangoFin].sort()[0];
      for (; k <= hasta; k = masDias(k, 1)) (idx[k] ||= []).push(ev);
    }
    // Primero lo de un solo día, después lo de varios días.
    Object.values(idx).forEach((l) => l.sort((a, b) => !!a.hasta - !!b.hasta));
    return idx;
  }, [eventos, rangoIni, rangoFin]);

  // Un turno fijo "aplica" a una fecha si coincide el día de la semana y la
  // fecha cae dentro del rango desde/hasta (hasta puede ser null).
  const fijosDelDia = (k) => {
    const dia = deClave(k).getDay();
    return horarios
      .filter((h) => h.dia_semana === dia && h.fecha_desde <= k && (!h.fecha_hasta || h.fecha_hasta >= k))
      .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
  };

  const q = normalizar(busqueda.trim());
  const coincideEvento = (ev) => normalizar(`${ev.titulo} ${ev.detalle || ""} ${nombrePaciente(ev.pacientes)}`).includes(q);
  const coincideFijo = (h) => normalizar(nombrePaciente(h.pacientes)).includes(q);

  /* ---------- Navegar ---------- */
  // Cambia el día elegido (y con él la semana) y lleva el calendario a ese mes.
  const irA = (k) => {
    setFoco(k);
    const f = deClave(k);
    const visible = f.getFullYear() === vista.anio && (f.getMonth() === vista.mes || f.getMonth() === vista.mes + 1);
    if (!visible) setVista({ anio: f.getFullYear(), mes: Math.min(f.getMonth(), 10) });
  };
  const moverMeses = (d) => {
    setSel(null);
    const m = vista.mes + d;
    if (m < 0) setVista({ anio: vista.anio - 1, mes: 10 });
    else if (m > 10) setVista({ anio: vista.anio + 1, mes: 0 });
    else setVista({ ...vista, mes: m });
  };

  /* ---------- Abrir un día y los formularios ---------- */
  const formNuevo = (k, hora = "") => ({
    ...EVENTO_VACIO, fecha: k, hasta: masDias(k, 4), hora, hora_fin: hora ? aHora(aMin(hora) + DURACION_DEFECTO) : "",
  });

  const abrirDia = (k, el, { y = null, hora = "" } = {}) => {
    anclaRef.current = el ? { el, y } : null;
    setSel(k);
    setModo("anotar");
    setForm(formNuevo(k, hora));
  };
  const cerrar = () => setSel(null);

  const editarEvento = (ev) => {
    setModo("anotar");
    setForm({
      id: ev.id, fecha: ev.fecha, titulo: ev.titulo, detalle: ev.detalle || "",
      hora: ev.hora?.slice(0, 5) || "", hora_fin: ev.hora_fin?.slice(0, 5) || "", paciente_id: ev.paciente_id || "",
      varios: !!ev.hasta, hasta: ev.hasta || masDias(ev.fecha, 4),
    });
  };

  const guardarEvento = async () => {
    const paciente = pacientes.find((p) => p.id === form.paciente_id);
    // Sin título pero con paciente: queda el nombre del paciente.
    const titulo = form.titulo.trim() || nombrePaciente(paciente);
    if (!titulo) {
      Swal.fire("Falta el qué", "Escribí qué es o elegí un paciente.", "warning");
      return;
    }
    if (form.varios && form.hasta < form.fecha) {
      Swal.fire("Revisá las fechas", "El «hasta» tiene que ser después del día de inicio.", "warning");
      return;
    }
    if (form.hora && form.hora_fin && form.hora_fin <= form.hora) {
      Swal.fire("Revisá el horario", "La hora de fin tiene que ser después de la de inicio.", "warning");
      return;
    }
    const payload = {
      fecha: form.fecha,
      hasta: form.varios && form.hasta > form.fecha ? form.hasta : null,
      tipo: form.paciente_id ? "paciente" : "otro",
      titulo,
      detalle: form.detalle.trim() || null,
      hora: form.hora || null,
      hora_fin: form.hora && form.hora_fin ? form.hora_fin : null,
      paciente_id: form.paciente_id || null,
    };
    const { error } = form.id
      ? await supabase.from("agenda_eventos").update(payload).eq("id", form.id)
      : await supabase.from("agenda_eventos").insert([payload]);
    if (error) { Swal.fire("Error", "No se pudo guardar.", "error"); return; }
    setForm(formNuevo(sel));
    recargarEventos();
  };

  const borrarEvento = async (ev) => {
    const r = await Swal.fire({
      title: `¿Borrar «${ev.titulo}»?`,
      text: ev.hasta ? `Se borra completo (${rangoTxt(ev.fecha, ev.hasta)}).` : undefined,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Borrar",
      cancelButtonText: "Cancelar",
    });
    if (!r.isConfirmed) return;
    const { error } = await supabase.from("agenda_eventos").delete().eq("id", ev.id);
    if (error) { Swal.fire("Error", "No se pudo borrar.", "error"); return; }
    if (form.id === ev.id) setForm(formNuevo(sel));
    recargarEventos();
  };

  const nuevoFijo = () => {
    setFormFijo({ ...FIJO_VACIO, fecha_desde: sel, hora_inicio: form.hora, hora_fin: form.hora_fin });
    setModo("fijo");
  };

  const editarFijo = (h) => {
    setFormFijo({
      id: h.id,
      hora_inicio: h.hora_inicio?.slice(0, 5) || "",
      hora_fin: h.hora_fin?.slice(0, 5) || "",
      sede_id: h.sede_id || "",
      paciente_id: h.paciente_id || "",
      paciente_nuevo: "",
      fecha_desde: h.fecha_desde || "",
      fecha_hasta: h.fecha_hasta || "",
      dias_pago_personalizado: h.dias_pago_personalizado ?? "",
    });
    setModo("fijo");
  };

  const guardarFijo = async () => {
    const f = formFijo;
    if (!f.hora_inicio || !f.hora_fin || !f.sede_id || !f.fecha_desde) {
      Swal.fire("Faltan datos", "Horario, lugar y desde cuándo son obligatorios.", "warning");
      return;
    }
    if (f.hora_fin <= f.hora_inicio) {
      Swal.fire("Revisá el horario", "La hora de fin tiene que ser después de la de inicio.", "warning");
      return;
    }
    if (!f.paciente_id && !f.paciente_nuevo.trim()) {
      Swal.fire("Faltan datos", "Buscá el paciente o cargá uno nuevo.", "warning");
      return;
    }

    let pacienteId = f.paciente_id;
    if (!pacienteId) {
      const [nombre, ...resto] = f.paciente_nuevo.trim().split(" ");
      const { data, error } = await supabase.from("pacientes").insert([{ nombre, apellido: resto.join(" ") }]).select().single();
      if (error) { Swal.fire("Error", "No se pudo crear el paciente.", "error"); return; }
      pacienteId = data.id;
      setPacientes((prev) => [...prev, data].sort((a, b) => a.nombre.localeCompare(b.nombre)));
    }

    const payload = {
      paciente_id: pacienteId,
      sede_id: f.sede_id,
      // Al editar se mantiene su día de la semana; uno nuevo toma el del día abierto.
      ...(f.id ? {} : { dia_semana: deClave(sel).getDay() }),
      hora_inicio: f.hora_inicio,
      hora_fin: f.hora_fin,
      fecha_desde: f.fecha_desde,
      fecha_hasta: f.fecha_hasta || null,
      dias_pago_personalizado: f.dias_pago_personalizado === "" ? null : Number(f.dias_pago_personalizado),
    };
    const { error } = f.id
      ? await supabase.from("horarios_pacientes").update(payload).eq("id", f.id)
      : await supabase.from("horarios_pacientes").insert([payload]);
    if (error) { Swal.fire("Error", "No se pudo guardar.", "error"); return; }
    setModo("anotar");
    cargarHorarios();
  };

  const borrarFijo = async (h) => {
    const r = await Swal.fire({
      title: "¿Eliminar este turno fijo?",
      text: `Se borra por completo: deja de aparecer todos los ${DIAS_LARGO[h.dia_semana]}.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Eliminar",
      cancelButtonText: "Cancelar",
    });
    if (!r.isConfirmed) return;
    const { error } = await supabase.from("horarios_pacientes").delete().eq("id", h.id);
    if (error) { Swal.fire("Error", "No se pudo eliminar.", "error"); return; }
    cargarHorarios();
  };

  /* ---------- El globo: se ubica al lado de lo tocado (en el celular, abajo) ---------- */
  useLayoutEffect(() => {
    if (!sel) return;
    const ubicar = () => {
      const pop = popRef.current;
      if (!pop) return;
      const ancla = anclaRef.current?.el?.isConnected ? anclaRef.current : null;
      const abajo = window.matchMedia("(max-width: 899px)").matches || !ancla;
      pop.classList.toggle("abajo", abajo);
      if (abajo) { pop.style.left = ""; pop.style.top = ""; return; }
      let r = ancla.el.getBoundingClientRect();
      if (ancla.y != null) r = { left: r.left, right: r.right, top: r.top + ancla.y - 12, height: 24 };
      // 88px: debajo del navbar fijo de la página.
      const top = Math.max(88, Math.min(r.top - 40, window.innerHeight - pop.offsetHeight - 12));
      const izq = r.right + 12 + pop.offsetWidth > window.innerWidth - 8;
      pop.classList.toggle("a-izq", izq);
      pop.style.left = `${izq ? Math.max(8, r.left - 12 - pop.offsetWidth) : r.right + 12}px`;
      pop.style.top = `${top}px`;
      pop.style.setProperty("--y", `${r.top + r.height / 2 - top - 6}px`);
    };
    ubicar();
    window.addEventListener("resize", ubicar);
    window.addEventListener("scroll", ubicar, true);
    return () => {
      window.removeEventListener("resize", ubicar);
      window.removeEventListener("scroll", ubicar, true);
    };
  });

  // En la compu el cursor ya queda en "qué hay"; en el celular no, para que
  // no salte el teclado tapando todo apenas se toca.
  useEffect(() => {
    if (sel && modo === "anotar" && !window.matchMedia("(max-width: 899px)").matches) {
      tituloRef.current?.focus({ preventScroll: true });
    }
  }, [sel, modo, form.id]);

  // Se cierra con Escape o tocando afuera (tocar otro día o bloque lo cambia;
  // los carteles de confirmación de Swal no cuentan como "afuera").
  useEffect(() => {
    if (!sel) return;
    const tecla = (e) => { if (e.key === "Escape" && !document.querySelector(".swal2-container")) cerrar(); };
    const clic = (e) => { if (!e.target.closest(".cal-pop, .cal-d, .cal-fila, .ag-col, .ag-cab-dia, .ag-chip, .ag-dl, .ag-agregar, .swal2-container")) cerrar(); };
    document.addEventListener("keydown", tecla);
    document.addEventListener("mousedown", clic);
    return () => {
      document.removeEventListener("keydown", tecla);
      document.removeEventListener("mousedown", clic);
    };
  }, [sel]);

  /* =================== 1. LA SEMANA =================== */
  const diasSemana = Array.from({ length: 7 }, (_, i) => masDias(semana, i));
  // Lo de cada día: bloques con horario (turnos fijos + lo anotado con hora)
  // y, aparte, lo anotado sin hora ("todo el día").
  const delDia = (k) => {
    const fijos = fijosDelDia(k).map((h) => ({ clave: `f${h.id}`, ini: aMin(h.hora_inicio), fin: aMin(h.hora_fin), fijo: h }));
    const evs = eventosPorDia[k] || [];
    const conHora = evs.filter((ev) => ev.hora).map((ev) => {
      const ini = aMin(ev.hora);
      return { clave: `e${ev.id}`, ini, fin: ev.hora_fin ? aMin(ev.hora_fin) : ini + DURACION_DEFECTO, ev };
    });
    return { bloques: [...fijos, ...conHora], todoElDia: evs.filter((ev) => !ev.hora) };
  };
  const semanaDatos = diasSemana.map((k) => ({ k, ...delDia(k) }));
  // El domingo solo aparece si esa semana tiene algo.
  const columnas = semanaDatos.filter((d, i) => i < 6 || d.bloques.length || d.todoElDia.length);
  const todos = columnas.flatMap((d) => d.bloques);
  const t0 = Math.min(8 * 60, ...todos.map((b) => Math.floor(b.ini / 60) * 60));
  const t1 = Math.max(20 * 60, ...todos.map((b) => Math.ceil(b.fin / 60) * 60));
  const hayTodoElDia = columnas.some((d) => d.todoElDia.length);

  const abrirBloque = (e, k, b) => {
    e.stopPropagation();
    abrirDia(k, e.currentTarget);
    if (b.fijo) editarFijo(b.fijo);
    else editarEvento(b.ev);
  };

  // Tocar un hueco de la grilla: anotar algo ese día a esa hora (redondeada a la media hora).
  const clicHueco = (e, k) => {
    const y = e.clientY - e.currentTarget.getBoundingClientRect().top;
    const min = Math.min(t1 - 30, t0 + Math.floor((y / PX_HORA) * 2) * 30);
    abrirDia(k, e.currentTarget, { y, hora: aHora(min) });
  };

  const contenidoBloque = (b) => b.fijo ? (
    <>
      <b>{nombrePaciente(b.fijo.pacientes)}</b>
      <small>{aHora(b.ini)}–{aHora(b.fin)} · {b.fijo.sedes?.nombre}</small>
    </>
  ) : (
    <>
      <b>{!b.ev.paciente_id && <Estrella />}{b.ev.titulo}</b>
      <small>{aHora(b.ini)}–{aHora(b.fin)}{b.ev.pacientes && !b.ev.titulo.includes(nombrePaciente(b.ev.pacientes)) ? ` · ${nombrePaciente(b.ev.pacientes)}` : ""}</small>
    </>
  );
  const colorBloque = (b) => varsColor(b.fijo ? colorPaciente(b.fijo.paciente_id) : colorEvento(b.ev));

  const chip = (ev, k) => (
    <button key={ev.id} className={`ag-chip ${ev.hasta ? "rango" : ""}`} style={varsColor(colorEvento(ev))} onClick={(e) => { abrirDia(k, e.currentTarget); editarEvento(ev); }} title={ev.titulo}>
      {!ev.paciente_id && <Estrella />}<span>{ev.titulo}</span>
    </button>
  );

  const finSemana = deClave(masDias(semana, 6));
  const iniSemana = deClave(semana);
  const tituloSemana = iniSemana.getMonth() === finSemana.getMonth()
    ? `${iniSemana.getDate()} al ${finSemana.getDate()} de ${MESES[finSemana.getMonth()]}`
    : `${iniSemana.getDate()} de ${MESES[iniSemana.getMonth()]} al ${finSemana.getDate()} de ${MESES[finSemana.getMonth()]}`;

  const grillaSemana = (
    <div className="ag-grilla" style={{ "--dias": columnas.length }}>
      <div className="ag-fila ag-cab">
        <span />
        {columnas.map(({ k }) => {
          const f = deClave(k);
          return (
            <button key={k} className={`ag-cab-dia ${k === kHoy ? "hoy" : ""} ${k === foco ? "foco" : ""}`} onClick={(e) => { setFoco(k); abrirDia(k, e.currentTarget); }}>
              {DIAS_CORTO[f.getDay()]} <b>{f.getDate()}</b>
            </button>
          );
        })}
      </div>
      {hayTodoElDia && (
        <div className="ag-fila ag-todo">
          <span className="ag-todo-et">Todo el día</span>
          {columnas.map(({ k, todoElDia }) => <div key={k} className="ag-todo-col">{todoElDia.map((ev) => chip(ev, k))}</div>)}
        </div>
      )}
      <div className="ag-fila ag-cuerpo" style={{ height: ((t1 - t0) / 60) * PX_HORA }}>
        <div className="ag-horas">
          {Array.from({ length: (t1 - t0) / 60 + 1 }, (_, i) => <span key={i} style={{ top: i * PX_HORA }}>{aHora(t0 + i * 60)}</span>)}
        </div>
        {columnas.map(({ k, bloques }) => (
          <div key={k} className={`ag-col ${k === kHoy ? "hoy" : ""}`} onClick={(e) => clicHueco(e, k)}>
            {Array.from({ length: (t1 - t0) / 60 }, (_, i) => <i key={i} className="ag-linea" style={{ top: (i + 1) * PX_HORA }} />)}
            {carriles(bloques).map((b) => (
              <button
                key={b.clave}
                className={`ag-b ${b.fijo ? "fijo" : "evento"} ${b.ev?.hasta ? "rango" : ""} ${b.fin - b.ini < 40 ? "corto" : ""} ${q && !(b.fijo ? coincideFijo(b.fijo) : coincideEvento(b.ev)) ? "apagado" : ""}`}
                style={{
                  ...colorBloque(b),
                  top: ((b.ini - t0) / 60) * PX_HORA + 1,
                  height: Math.max(22, ((b.fin - b.ini) / 60) * PX_HORA - 2),
                  left: `calc(${(100 / b.carriles) * b.carril}% + 3px)`,
                  width: `calc(${100 / b.carriles}% - 6px)`,
                }}
                onClick={(e) => abrirBloque(e, k, b)}
              >
                {contenidoBloque(b)}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );

  // Celular: un día a la vez, en lista.
  const datosFoco = semanaDatos.find((d) => d.k === foco) || semanaDatos[0];
  const listaDia = (
    <div className="ag-movil">
      <div className="ag-dtabs">
        {columnas.map(({ k, bloques, todoElDia }) => {
          const f = deClave(k);
          return (
            <button key={k} className={`${k === datosFoco.k ? "on" : ""} ${k === kHoy ? "hoy" : ""}`} onClick={() => setFoco(k)}>
              {DIAS_CORTO[f.getDay()]}<b>{f.getDate()}</b>{(bloques.length > 0 || todoElDia.length > 0) && <i />}
            </button>
          );
        })}
      </div>
      {datosFoco.todoElDia.length > 0 && <div className="ag-movil-todo">{datosFoco.todoElDia.map((ev) => chip(ev, datosFoco.k))}</div>}
      {datosFoco.bloques.length === 0 && datosFoco.todoElDia.length === 0 && <p className="cal-vacio">No hay nada este día.</p>}
      {[...datosFoco.bloques].sort((a, b) => a.ini - b.ini).map((b) => (
        <button key={b.clave} className="ag-dl" onClick={(e) => abrirBloque(e, datosFoco.k, b)}>
          <span className="ag-dl-h">{aHora(b.ini)}<small>{aHora(b.fin)}</small></span>
          <span className={`ag-dl-b ${b.ev?.hasta ? "rango" : ""}`} style={colorBloque(b)}>{contenidoBloque(b)}</span>
        </button>
      ))}
      <button className="cal-btn ag-agregar" onClick={() => abrirDia(datosFoco.k, null)}><FaPlus /> Anotar algo el {DIAS_LARGO[deClave(datosFoco.k).getDay()]}</button>
    </div>
  );

  /* =================== 2. EL CALENDARIO =================== */
  const renderDia = (k, d, finde) => {
    const evs = eventosPorDia[k] || [];
    const marcas = evs.slice(0, 3);
    const fijos = fijosDelDia(k);
    const coincide = q && (evs.some(coincideEvento) || fijos.some(coincideFijo));
    const estilo = marcas.length === 1 ? varsColor(colorEvento(marcas[0])) : Object.assign({}, ...marcas.map((ev, i) => varsColor(colorEvento(ev), i + 1)));
    const rangos = marcas.length === 1 ? (marcas[0].hasta ? "rango" : "") : marcas.map((ev, i) => (ev.hasta ? `r${i + 1}` : "")).join(" ");
    const clases = [
      "cal-d",
      finde && "finde",
      k < kHoy && "pasado",
      k === kHoy && "hoy",
      k >= semana && k <= masDias(semana, 6) && "semana",
      marcas.length && "marca",
      ["", "", "dos", "tres"][marcas.length],
      rangos,
      k === sel && "sel",
      q && (coincide ? "coincide" : "apagado"),
    ].filter(Boolean).join(" ");
    const titulo = [...evs.map((ev) => ev.titulo), fijos.length && `${fijos.length} turno${fijos.length > 1 ? "s" : ""} fijo${fijos.length > 1 ? "s" : ""}`].filter(Boolean).join(" · ");

    return (
      <button
        key={k}
        className={clases}
        style={estilo}
        data-dia={k}
        onClick={(e) => { if (sel === k) { cerrar(); return; } setFoco(k); abrirDia(k, e.currentTarget); }}
        title={titulo || "Anotar algo este día"}
      >
        {d}
        {marcas.map((ev, i) => !ev.paciente_id && <Estrella key={ev.id} className={`ti${i + 1}${ev.hasta ? " tn" : ""}`} />)}
        {fijos.length > 0 && <span className="cal-fijos" />}
      </button>
    );
  };

  const renderMes = (anio, m) => {
    const ini = (new Date(anio, m, 1).getDay() + 6) % 7;
    const dias = new Date(anio, m + 1, 0).getDate();
    return (
      <div className="cal-mes" key={m}>
        <div className="cal-mes-cab"><b>{capital(MESES[m])}</b> <span>{anio}</span></div>
        <div className="cal-sem">{["L", "M", "M", "J", "V", "S", "D"].map((x, i) => <span key={i}>{x}</span>)}</div>
        <div className="cal-dias">
          {Array.from({ length: ini }, (_, i) => <span key={`v${i}`} />)}
          {Array.from({ length: dias }, (_, i) => renderDia(claveDia(new Date(anio, m, i + 1)), i + 1, (ini + i) % 7 >= 5))}
        </div>
      </div>
    );
  };

  const filaEvento = (ev) => {
    const f = deClave(ev.fecha);
    const h = ev.hasta && deClave(ev.hasta);
    const enCurso = ev.hasta && ev.fecha <= kHoy && ev.hasta >= kHoy;
    const falta = enCurso ? "ahora" : faltaTexto(ev.fecha);
    return (
      <button key={ev.id} className={`cal-fila ${falta === "hoy" || falta === "mañana" || enCurso ? "cerca" : ""}`} style={varsColor(colorEvento(ev))} onClick={() => irA(ev.fecha)}>
        <span className="cal-fila-d">
          {h
            ? <><b className="rango">{f.getDate()}–{h.getDate()}</b>{mesCorto(f)}{h.getMonth() !== f.getMonth() && `–${mesCorto(h)}`}</>
            : <><b>{f.getDate()}</b>{DIAS_CORTO[f.getDay()]}</>}
        </span>
        <span className="cal-fila-q">
          <b>{ev.titulo}</b>
          <small>
            {ev.paciente_id ? <i className="cal-punto" /> : <Estrella />}
            <span>{[ev.paciente_id ? nombrePaciente(ev.pacientes) : "Otro", ev.hora?.slice(0, 5)].filter(Boolean).join(" · ")}</span>
          </small>
        </span>
        <span className="cal-fila-falta">{falta}</span>
      </button>
    );
  };

  // Lo que coincide con la búsqueda: lo anotado (en lo cargado) y sus turnos fijos.
  const resultados = q ? eventos.filter(coincideEvento) : [];
  const fijosBuscados = q ? horarios.filter(coincideFijo).sort((a, b) => a.dia_semana - b.dia_semana || a.hora_inicio.localeCompare(b.hora_inicio)) : [];

  /* =================== El globo =================== */
  const popDia = () => {
    const f = deClave(sel);
    const evs = eventosPorDia[sel] || [];
    const fijos = fijosDelDia(sel);

    return (
      <>
        <div className="cal-fondo" onClick={cerrar} />
        <div className="cal-pop" ref={popRef} role="dialog" aria-label={`${DIAS_LARGO[f.getDay()]} ${f.getDate()} de ${MESES[f.getMonth()]}`}>
          <div className="cal-pop-cab">
            <h3>{capital(DIAS_LARGO[f.getDay()])} {f.getDate()} de {MESES[f.getMonth()]}</h3>
            <button className="cal-x" onClick={cerrar} aria-label="Cerrar"><FaTimes /></button>
          </div>

          {modo === "anotar" ? (
            <>
              {evs.length > 0 && (
                <div className="cal-pop-ya">
                  {evs.map((ev) => (
                    <div key={ev.id} className={`${ev.hasta ? "rango" : ""} ${form.id === ev.id ? "editando" : ""}`} style={varsColor(colorEvento(ev))}>
                      {ev.paciente_id ? <i className="cal-punto" /> : <Estrella />}
                      <span>
                        <b>{ev.titulo}</b>
                        <small>
                          {[ev.hora && `${ev.hora.slice(0, 5)}${ev.hora_fin ? `–${ev.hora_fin.slice(0, 5)}` : ""}`, ev.pacientes && nombrePaciente(ev.pacientes), ev.hasta && rangoTxt(ev.fecha, ev.hasta)].filter(Boolean).join(" · ") || "Otro"}
                        </small>
                        {ev.detalle && <small className="cal-detalle">{ev.detalle}</small>}
                      </span>
                      <button onClick={() => editarEvento(ev)} aria-label="Editar"><FaEdit /></button>
                      <button onClick={() => borrarEvento(ev)} aria-label="Borrar"><FaTrash /></button>
                    </div>
                  ))}
                </div>
              )}

              <div className="cal-pop-fijos">
                <div className="cal-pop-sub">
                  <span>Turnos fijos <small>· todos los {DIAS_LARGO[f.getDay()]}</small></span>
                  <button className="cal-link" onClick={nuevoFijo}><FaPlus /> Turno fijo</button>
                </div>
                {fijos.length === 0 ? (
                  <p className="cal-vacio">Ninguno este día.</p>
                ) : fijos.map((h) => (
                  <div key={h.id} className="cal-fijo" style={varsColor(colorPaciente(h.paciente_id))}>
                    <b>{h.hora_inicio?.slice(0, 5)}</b>
                    <span>{nombrePaciente(h.pacientes)}<small>{h.sedes?.nombre}</small></span>
                    <button onClick={() => editarFijo(h)} aria-label="Editar turno fijo"><FaEdit /></button>
                    <button onClick={() => borrarFijo(h)} aria-label="Eliminar turno fijo"><FaTrash /></button>
                  </div>
                ))}
              </div>

              <div className="cal-pop-sub"><span>{form.id ? "Editar" : "Anotar algo"}</span></div>
              <p className="cal-ayuda-form">Con paciente, va con su color. Sin paciente queda como <span className="cal-otro"><Estrella /> Otro</span> y el título dice qué es.</p>
              <input
                className="cal-in"
                value={form.titulo}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
                onKeyDown={(e) => { if (e.key === "Enter") guardarEvento(); }}
                placeholder="¿Qué es? Ej: reunión en la escuela, curso, feriado…"
                maxLength={80}
                ref={tituloRef}
              />
              <BuscarPaciente pacientes={pacientes} pacienteId={form.paciente_id} onElegir={(id) => setForm({ ...form, paciente_id: id })} />
              <div className="cal-fila-form">
                <label>
                  Desde (opcional)
                  <input
                    className="cal-in"
                    type="time"
                    value={form.hora}
                    onChange={(e) => {
                      const hora = e.target.value;
                      // Si todavía no tiene fin, se completa solo con la duración de una sesión.
                      setForm({ ...form, hora, hora_fin: form.hora_fin || !hora ? form.hora_fin : aHora(aMin(hora) + DURACION_DEFECTO) });
                    }}
                  />
                </label>
                <label>Hasta<input className="cal-in" type="time" value={form.hora_fin} disabled={!form.hora} onChange={(e) => setForm({ ...form, hora_fin: e.target.value })} /></label>
              </div>
              <div className="cal-varios">
                <label className="cal-check">
                  <input type="checkbox" checked={form.varios} onChange={(e) => setForm({ ...form, varios: e.target.checked })} /> Varios días
                </label>
                {form.varios && (
                  <label className="cal-check">
                    hasta el
                    <input className="cal-in cal-in-chico" type="date" min={form.fecha} value={form.hasta} onChange={(e) => setForm({ ...form, hasta: e.target.value })} />
                  </label>
                )}
              </div>
              <textarea className="cal-in cal-ta" rows={2} value={form.detalle} onChange={(e) => setForm({ ...form, detalle: e.target.value })} placeholder="Notas (opcional)" />
              <div className="cal-pop-acc">
                {form.id && <button className="cal-btn plano" onClick={() => setForm(formNuevo(sel))}>Cancelar edición</button>}
                <button className="cal-btn pri" onClick={guardarEvento}>{form.id ? "Guardar cambios" : "Anotar"}</button>
              </div>
            </>
          ) : (
            <>
              <div className="cal-pop-sub">
                <span>{formFijo.id ? "Editar turno fijo" : `Nuevo turno fijo · todos los ${DIAS_LARGO[f.getDay()]}`}</span>
              </div>
              <BuscarPaciente
                pacientes={pacientes}
                pacienteId={formFijo.paciente_id}
                onElegir={(id) => setFormFijo({ ...formFijo, paciente_id: id, paciente_nuevo: "" })}
                nuevo={formFijo.paciente_nuevo}
                onNuevo={(nombre) => setFormFijo({ ...formFijo, paciente_id: "", paciente_nuevo: nombre })}
              />
              <div className="cal-fila-form">
                <label>Desde las<input className="cal-in" type="time" value={formFijo.hora_inicio} onChange={(e) => setFormFijo({ ...formFijo, hora_inicio: e.target.value })} /></label>
                <label>Hasta las<input className="cal-in" type="time" value={formFijo.hora_fin} onChange={(e) => setFormFijo({ ...formFijo, hora_fin: e.target.value })} /></label>
              </div>
              <label className="cal-label">
                Lugar
                <select className="cal-in" value={formFijo.sede_id} onChange={(e) => setFormFijo({ ...formFijo, sede_id: e.target.value })}>
                  <option value="">Elegir…</option>
                  {sedes.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                </select>
              </label>
              <div className="cal-fila-form">
                <label>Empieza<input className="cal-in" type="date" value={formFijo.fecha_desde} onChange={(e) => setFormFijo({ ...formFijo, fecha_desde: e.target.value })} /></label>
                <label>Termina (opcional)<input className="cal-in" type="date" value={formFijo.fecha_hasta} onChange={(e) => setFormFijo({ ...formFijo, fecha_hasta: e.target.value })} /></label>
              </div>
              <label className="cal-label">
                Cobra a los X días (opcional, pisa lo del paciente / obra social)
                <input className="cal-in" type="number" value={formFijo.dias_pago_personalizado} onChange={(e) => setFormFijo({ ...formFijo, dias_pago_personalizado: e.target.value })} placeholder="Ej: 30, 60, 90" />
              </label>
              <div className="cal-pop-acc">
                <button className="cal-btn plano" onClick={() => setModo("anotar")}>Volver</button>
                <button className="cal-btn pri" onClick={guardarFijo}>Guardar turno fijo</button>
              </div>
            </>
          )}
        </div>
      </>
    );
  };

  return (
    <div className="ag">
      <section className="ag-zona">
        <div className="ag-barra">
          <div className="cal-flechas">
            <button onClick={() => { cerrar(); irA(masDias(foco, -7)); }} aria-label="Semana anterior"><FaChevronLeft /></button>
            <button onClick={() => { cerrar(); irA(masDias(foco, 7)); }} aria-label="Semana siguiente"><FaChevronRight /></button>
          </div>
          <h2>Semana del {tituloSemana}</h2>
          {semana !== lunesDe(kHoy) && <button className="cal-btn" onClick={() => { cerrar(); irA(kHoy); }}>Esta semana</button>}
        </div>

        {faltaTabla && (
          <p className="cal-aviso">No se pudo leer la agenda. Si es la primera vez, falta crear la tabla <code>agenda_eventos</code> en Supabase.</p>
        )}

        <p className="ag-ayuda">Tocá un hueco para anotar algo a esa hora, o un bloque para cambiarlo. Los turnos fijos se repiten todas las semanas.</p>
        <div className="ag-scroll">{grillaSemana}</div>
        {listaDia}

      </section>

      <aside className="ag-lado">
        <div className="cal-top">
          <b>Calendario</b>
          <div className="cal-flechas">
            <button onClick={() => moverMeses(-1)} aria-label="Mes anterior"><FaChevronLeft /></button>
            <button onClick={() => moverMeses(1)} aria-label="Mes siguiente"><FaChevronRight /></button>
          </div>
        </div>
        {/* Los doce meses en dos filas de seis; se ven de a dos */}
        <div className="cal-tabs-meses">
          {MESES.map((m, i) => (
            <button key={m} className={i === vista.mes || i === vista.mes + 1 ? "on" : ""} onClick={() => { cerrar(); setVista({ ...vista, mes: Math.min(i, 10) }); }}>
              {capital(m.slice(0, 3))}
            </button>
          ))}
        </div>
        {renderMes(vista.anio, vista.mes)}
        {renderMes(vista.anio, vista.mes + 1)}

        <div className="cal-buscar">
          <FaSearch />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar paciente o nota…" />
          {busqueda && <button onClick={() => setBusqueda("")} aria-label="Borrar búsqueda"><FaTimes /></button>}
        </div>

        {q ? (
          <>
            <div className="cal-sub">Turnos fijos</div>
            {fijosBuscados.length === 0 ? <p className="cal-vacio">Ninguno.</p> : fijosBuscados.map((h) => (
              <div key={h.id} className="cal-fijo" style={varsColor(colorPaciente(h.paciente_id))}>
                <b>{DIAS_CORTO[h.dia_semana]} {h.hora_inicio?.slice(0, 5)}</b>
                <span>{nombrePaciente(h.pacientes)}<small>{h.sedes?.nombre}{h.fecha_hasta ? ` · hasta ${h.fecha_hasta.split("-").reverse().join("/")}` : ""}</small></span>
              </div>
            ))}
            <div className="cal-sub">Anotado</div>
            {resultados.length === 0 ? <p className="cal-vacio">Nada en {vista.anio}.</p> : resultados.map(filaEvento)}
          </>
        ) : (
          <>
            <div className="cal-sub">Próximas fechas</div>
            {proximos.length === 0
              ? <p className="cal-vacio">Tocá un día para anotar una evaluación, un informe, una reunión o lo que quieras.</p>
              : proximos.map(filaEvento)}
          </>
        )}
      </aside>

      {sel && popDia()}
    </div>
  );
}
