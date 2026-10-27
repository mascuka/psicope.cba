import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabase/supabaseClient";
import Swal from "sweetalert2";
import { FaPlus, FaTrash, FaEdit, FaArrowUp, FaArrowDown } from "react-icons/fa";
import SelectorMes from "./SelectorMes";
import { sesionesEntre, masDias, claveDia, deClave } from "./sesiones";
import "./panelFinanzas.css";

/*
 * Finanzas: todo lo del mes en un solo lugar.
 * - Entró: las sesiones de los turnos fijos (en efectivo el mismo día; las de
 *   obra social cuando paga, a sus días de pago), las ventas de materiales de
 *   la web y los cobros cargados a mano.
 * - Salió: los gastos cargados.
 * - Pendientes: lo que deben las obras sociales y los gastos fijos que
 *   todavía no se cargaron este mes ("Ya lo pagué").
 * - Movimientos: todo lo anterior en una lista por día.
 */

const formatoMoneda = (n) => `$${Math.round(Number(n || 0)).toLocaleString("es-AR")}`;
const hoyISO = () => claveDia(new Date());
const fechaCorta = (k) => k.split("-").reverse().slice(0, 2).join("/");
const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const CATEGORIAS_GASTO = ["Monotributo", "Alquiler", "Servicios", "Insumos", "Impuestos", "Otro"];
const COLORES_GASTO = ["#E8876A", "#C97B98", "#8E9BD6", "#6FAF9A", "#D6A35C", "#9C96A3"];
// De dónde viene la plata
const FUENTES = {
  efectivo: { nombre: "Pacientes (efectivo)", color: "#D48CA6" },
  obra_social: { nombre: "Obras sociales", color: "#9B87D9" },
  ventas: { nombre: "Materiales (web)", color: "#5FA3D6" },
  otros: { nombre: "Otros cobros", color: "#E0A93B" },
};

// Para que entren las sesiones de obra social que se cobran en el mes, se
// cuentan desde bastante antes (una de septiembre se cobra en noviembre si
// la obra social paga a los 60 días).
const DIAS_ATRAS_SESIONES = 180;

const COBRO_VACIO = { paciente_id: "", concepto: "", monto: "", fecha: "", notas: "" };
const GASTO_VACIO = { concepto: "", categoria: "Otro", monto: "", fecha: "", recurrente: false, frecuencia: "mensual", notas: "" };

const nombrePaciente = (p) => (p ? `${p.nombre || ""} ${p.apellido || ""}`.trim() : "");

// Primer y último día de un mes (mes de 0 a 11; se acomoda solo si se pasa).
const rangoMes = (anio, mes) => ({ desde: claveDia(new Date(anio, mes, 1)), hasta: claveDia(new Date(anio, mes + 1, 0)) });

// Todo lo de un mes: qué entró (y de dónde) y qué salió (y en qué).
function calcularMes({ horarios, excepciones, obrasSociales, ventas, cobros, gastos }, desde, hasta) {
  // Solo lo que ya se cobró (hasta hoy): lo que falta de las obras sociales va en "Te deben".
  const tope = [hasta, hoyISO()].sort()[0];
  const sesiones = sesionesEntre(horarios, excepciones, obrasSociales, masDias(desde, -DIAS_ATRAS_SESIONES), tope)
    .filter((x) => x.monto > 0 && x.fechaCobro >= desde && x.fechaCobro <= tope);
  const ventasMes = ventas.filter((v) => { const k = claveDia(new Date(v.fecha)); return k >= desde && k <= hasta; });
  const cobrosMes = cobros.filter((c) => c.fecha >= desde && c.fecha <= hasta);
  const gastosMes = gastos.filter((g) => g.fecha >= desde && g.fecha <= hasta);

  const suma = (l, f) => l.reduce((a, x) => a + Number(f(x) || 0), 0);
  const entradas = {
    efectivo: suma(sesiones.filter((x) => x.forma === "efectivo"), (x) => x.monto),
    obra_social: suma(sesiones.filter((x) => x.forma === "obra_social"), (x) => x.monto),
    ventas: suma(ventasMes, (v) => v.precio_pagado),
    otros: suma(cobrosMes, (c) => c.monto),
  };
  const salidas = {};
  gastosMes.forEach((g) => { salidas[g.categoria || "Otro"] = (salidas[g.categoria || "Otro"] || 0) + Number(g.monto || 0); });
  const entro = Object.values(entradas).reduce((a, b) => a + b, 0);
  const salio = Object.values(salidas).reduce((a, b) => a + b, 0);
  return { sesiones, ventasMes, cobrosMes, gastosMes, entradas, salidas, entro, salio, quedo: entro - salio };
}

export default function PanelFinanzas() {
  const [datos, setDatos] = useState({ cobros: [], gastos: [], ventas: [], horarios: [], obrasSociales: [], excepciones: [] });
  const [pacientes, setPacientes] = useState([]);
  const [cargando, setCargando] = useState(true);

  const hoy = new Date();
  const [vista, setVista] = useState({ anio: hoy.getFullYear(), mes: hoy.getMonth() });
  const [filtro, setFiltro] = useState("todo"); // todo | entradas | salidas

  const [formCobro, setFormCobro] = useState(null); // null = cerrado
  const [editandoCobroId, setEditandoCobroId] = useState(null);
  const [formGasto, setFormGasto] = useState(null);
  const [editandoGastoId, setEditandoGastoId] = useState(null);

  const cargarTodo = async () => {
    const [c, g, v, p, h, o, x] = await Promise.all([
      supabase.from("cobros").select("*, pacientes(nombre, apellido)").order("fecha", { ascending: false }),
      supabase.from("gastos").select("*").order("fecha", { ascending: false }),
      supabase.from("compras").select("id, fecha, nombre_material, nombre_usuario, email_usuario, precio_pagado").eq("status", "approved"),
      supabase.from("pacientes").select("id, nombre, apellido").order("nombre"),
      supabase.from("horarios_pacientes").select("*, pacientes(nombre, apellido, obra_social_id, monto_personalizado, dias_pago_personalizado)"),
      supabase.from("obras_sociales").select("*"),
      // Si todavía no existe la tabla (base sin actualizar), no hay excepciones.
      supabase.from("horarios_excepciones").select("*"),
    ]);
    setDatos({
      cobros: c.data || [], gastos: g.data || [], ventas: v.data || [],
      horarios: h.data || [], obrasSociales: o.data || [], excepciones: x.data || [],
    });
    setPacientes(p.data || []);
    setCargando(false);
  };

  // cargarTodo guarda los datos recién cuando llegan de Supabase (después del await).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { cargarTodo(); }, []);

  const rango = rangoMes(vista.anio, vista.mes);
  const mes = useMemo(() => calcularMes(datos, rango.desde, rango.hasta), [datos, rango.desde, rango.hasta]);
  const anterior = useMemo(() => {
    const r = rangoMes(vista.anio, vista.mes - 1);
    return calcularMes(datos, r.desde, r.hasta);
  }, [datos, vista]);

  // "+12% que septiembre"
  const nombreMesAnterior = MESES[(vista.mes + 11) % 12];
  const comparar = (actual, previo, masEsMejor) => {
    if (!previo) return null;
    const pct = Math.round(((actual - previo) / previo) * 100);
    if (pct === 0) return { texto: `igual que ${nombreMesAnterior}`, bueno: true };
    return { texto: `${pct > 0 ? "+" : ""}${pct}% que ${nombreMesAnterior}`, bueno: masEsMejor ? pct > 0 : pct < 0 };
  };

  /* ---------- Pendientes ---------- */
  // Lo que las obras sociales todavía deben de sesiones que ya pasaron, por
  // obra social y mes en que se cobra (no depende del mes elegido).
  const porCobrar = useMemo(() => {
    const hoyK = hoyISO();
    const grupos = new Map();
    sesionesEntre(datos.horarios, datos.excepciones, datos.obrasSociales, masDias(hoyK, -DIAS_ATRAS_SESIONES), hoyK)
      .filter((x) => x.forma === "obra_social" && x.monto > 0 && x.fechaCobro >= hoyK)
      .forEach((x) => {
        const clave = `${x.obraSocial?.id}|${x.fechaCobro.slice(0, 7)}`;
        if (!grupos.has(clave)) grupos.set(clave, { clave, nombre: x.obraSocial?.nombre || "Obra social", desde: x.fechaCobro, hasta: x.fechaCobro, cantidad: 0, total: 0 });
        const g = grupos.get(clave);
        g.cantidad++;
        g.total += x.monto;
        if (x.fechaCobro < g.desde) g.desde = x.fechaCobro;
        if (x.fechaCobro > g.hasta) g.hasta = x.fechaCobro;
      });
    return [...grupos.values()].sort((a, b) => (a.desde < b.desde ? -1 : 1));
  }, [datos]);

  // Gastos fijos (recurrentes) que se cargaron antes pero todavía no en el mes elegido.
  const porPagar = useMemo(() => {
    const ultimo = new Map();
    datos.gastos.filter((g) => g.recurrente && g.fecha < rango.desde).forEach((g) => {
      const clave = (g.concepto || "").trim().toLowerCase();
      if (!ultimo.has(clave) || g.fecha > ultimo.get(clave).fecha) ultimo.set(clave, g);
    });
    const yaEsteMes = new Set(mes.gastosMes.map((g) => (g.concepto || "").trim().toLowerCase()));
    return [...ultimo.entries()].filter(([clave]) => !yaEsteMes.has(clave)).map(([, g]) => g);
  }, [datos.gastos, mes.gastosMes, rango.desde]);

  // Fecha que se sugiere al cargar algo: hoy si cae en el mes que se mira, si no el 1° de ese mes.
  const fechaSugerida = () => { const h = hoyISO(); return h >= rango.desde && h <= rango.hasta ? h : rango.desde; };

  const yaLoPague = async (g) => {
    const r = await Swal.fire({
      title: `¿Cuánto pagaste de ${g.concepto}?`,
      input: "number",
      inputValue: g.monto,
      inputAttributes: { min: "0" },
      showCancelButton: true,
      confirmButtonText: "Listo, pagado",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#D48CA6",
    });
    if (!r.isConfirmed) return;
    const { error } = await supabase.from("gastos").insert([{
      concepto: g.concepto, categoria: g.categoria, monto: Number(r.value || 0), fecha: fechaSugerida(),
      recurrente: true, frecuencia: g.frecuencia || "mensual",
    }]);
    if (error) { Swal.fire("Error", "No se pudo guardar.", "error"); return; }
    cargarTodo();
  };

  /* ---------- Movimientos del mes, por día ---------- */
  const movimientos = useMemo(() => {
    const lista = [];
    // Sesiones en efectivo: una fila por día, con quiénes vinieron.
    const efectivoPorDia = new Map();
    mes.sesiones.filter((x) => x.forma === "efectivo").forEach((x) => {
      if (!efectivoPorDia.has(x.fechaCobro)) efectivoPorDia.set(x.fechaCobro, []);
      efectivoPorDia.get(x.fechaCobro).push(x);
    });
    efectivoPorDia.forEach((l, fecha) => lista.push({
      clave: `ef-${fecha}`, fecha, entrada: true, color: FUENTES.efectivo.color,
      titulo: l.length === 1 ? `Sesión · ${nombrePaciente(l[0].horario.pacientes)}` : `${l.length} sesiones en efectivo`,
      detalle: l.length === 1 ? (l[0].falto ? "Faltó, se cobra igual" : "Efectivo") : l.map((x) => nombrePaciente(x.horario.pacientes)).join(", "),
      monto: l.reduce((a, x) => a + x.monto, 0),
    }));
    // Obras sociales: una fila por día de cobro y obra social.
    const osPorDia = new Map();
    mes.sesiones.filter((x) => x.forma === "obra_social").forEach((x) => {
      const clave = `${x.fechaCobro}|${x.obraSocial?.id}`;
      if (!osPorDia.has(clave)) osPorDia.set(clave, []);
      osPorDia.get(clave).push(x);
    });
    osPorDia.forEach((l, clave) => lista.push({
      clave: `os-${clave}`, fecha: l[0].fechaCobro, entrada: true, color: FUENTES.obra_social.color,
      titulo: l[0].obraSocial?.nombre || "Obra social",
      detalle: `${l.length} sesi${l.length === 1 ? "ón" : "ones"} del ${l.map((x) => fechaCorta(x.fecha)).join(", ")}`,
      monto: l.reduce((a, x) => a + x.monto, 0),
    }));
    mes.ventasMes.forEach((v) => lista.push({
      clave: `v-${v.id}`, fecha: claveDia(new Date(v.fecha)), entrada: true, color: FUENTES.ventas.color,
      titulo: v.nombre_material || "Material", detalle: `Venta web · ${v.nombre_usuario || v.email_usuario || "invitado"}`,
      monto: Number(v.precio_pagado || 0),
    }));
    mes.cobrosMes.forEach((c) => lista.push({
      clave: `c-${c.id}`, fecha: c.fecha, entrada: true, color: FUENTES.otros.color,
      titulo: c.pacientes ? nombrePaciente(c.pacientes) : c.concepto || "Cobro",
      detalle: [c.pacientes && c.concepto, c.notas].filter(Boolean).join(" · ") || "Cobro cargado a mano",
      monto: Number(c.monto || 0), cobro: c,
    }));
    mes.gastosMes.forEach((g) => lista.push({
      clave: `g-${g.id}`, fecha: g.fecha, entrada: false,
      color: COLORES_GASTO[Math.max(0, CATEGORIAS_GASTO.indexOf(g.categoria))],
      titulo: g.concepto, detalle: [g.categoria, g.recurrente && "fijo", g.notas].filter(Boolean).join(" · "),
      monto: Number(g.monto || 0), gasto: g,
    }));

    const filtrada = lista.filter((m) => filtro === "todo" || (filtro === "entradas" ? m.entrada : !m.entrada));
    const porDia = new Map();
    filtrada.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0)).forEach((m) => {
      if (!porDia.has(m.fecha)) porDia.set(m.fecha, []);
      porDia.get(m.fecha).push(m);
    });
    return [...porDia.entries()];
  }, [mes, filtro]);

  /* ---------- Cargar / editar a mano ---------- */
  const abrirNuevoCobro = () => { setFormGasto(null); setFormCobro({ ...COBRO_VACIO, fecha: fechaSugerida() }); setEditandoCobroId(null); };
  const abrirNuevoGasto = () => { setFormCobro(null); setFormGasto({ ...GASTO_VACIO, fecha: fechaSugerida() }); setEditandoGastoId(null); };

  const abrirEdicionCobro = (c) => {
    setFormGasto(null);
    setFormCobro({ paciente_id: c.paciente_id || "", concepto: c.concepto || "", monto: c.monto, fecha: c.fecha, notas: c.notas || "" });
    setEditandoCobroId(c.id);
  };
  const abrirEdicionGasto = (g) => {
    setFormCobro(null);
    setFormGasto({ concepto: g.concepto || "", categoria: g.categoria || "Otro", monto: g.monto, fecha: g.fecha, recurrente: !!g.recurrente, frecuencia: g.frecuencia || "mensual", notas: g.notas || "" });
    setEditandoGastoId(g.id);
  };

  const guardarCobro = async () => {
    if (!formCobro.paciente_id && !formCobro.concepto.trim()) {
      Swal.fire("Falta el concepto", "Elegí un paciente o escribí de qué es el cobro.", "warning");
      return;
    }
    const payload = {
      paciente_id: formCobro.paciente_id || null,
      concepto: formCobro.concepto.trim() || null,
      monto: formCobro.monto === "" ? 0 : Number(formCobro.monto),
      fecha: formCobro.fecha || hoyISO(),
      notas: formCobro.notas || null,
    };
    const { error } = editandoCobroId
      ? await supabase.from("cobros").update(payload).eq("id", editandoCobroId)
      : await supabase.from("cobros").insert([payload]);
    if (error) { Swal.fire("Error", "No se pudo guardar el cobro.", "error"); return; }
    setFormCobro(null);
    setEditandoCobroId(null);
    cargarTodo();
  };

  const guardarGasto = async () => {
    if (!formGasto.concepto.trim()) {
      Swal.fire("Falta el concepto", "Contá en qué se gastó (ej: Alquiler, Monotributo).", "warning");
      return;
    }
    if (!formGasto.monto || Number(formGasto.monto) <= 0) {
      Swal.fire("Falta el monto", "Cargá cuánto se gastó.", "warning");
      return;
    }
    const payload = {
      concepto: formGasto.concepto.trim(),
      categoria: formGasto.categoria,
      monto: Number(formGasto.monto),
      fecha: formGasto.fecha || hoyISO(),
      recurrente: formGasto.recurrente,
      frecuencia: formGasto.recurrente ? formGasto.frecuencia : null,
      notas: formGasto.notas || null,
    };
    const { error } = editandoGastoId
      ? await supabase.from("gastos").update(payload).eq("id", editandoGastoId)
      : await supabase.from("gastos").insert([payload]);
    if (error) { Swal.fire("Error", "No se pudo guardar el gasto.", "error"); return; }
    setFormGasto(null);
    setEditandoGastoId(null);
    cargarTodo();
  };

  const eliminar = async (tabla, item, que) => {
    const res = await Swal.fire({
      title: `¿Eliminar este ${que}?`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#D48CA6",
      confirmButtonText: "Eliminar",
      cancelButtonText: "Cancelar",
    });
    if (!res.isConfirmed) return;
    await supabase.from(tabla).delete().eq("id", item.id);
    cargarTodo();
  };

  if (cargando) return <div className="fin"><p className="fin-vacio">Cargando finanzas...</p></div>;

  /* ---------- Piezas de la pantalla ---------- */
  const tarjeta = (titulo, valor, clase, comparacion) => (
    <div className={`fin-kpi ${clase}`}>
      <span className="fin-kpi-titulo">{titulo}</span>
      <b>{formatoMoneda(valor)}</b>
      {comparacion && <span className={`fin-kpi-comp ${comparacion.bueno ? "bueno" : "malo"}`}>{comparacion.texto}</span>}
    </div>
  );

  // Una barra partida en colores + la lista de cada parte con su monto.
  const barraPartes = (titulo, partes, total) => {
    const conMonto = partes.filter((p) => p.monto > 0);
    return (
      <div className="fin-partes">
        <div className="fin-partes-cab"><b>{titulo}</b><span>{formatoMoneda(total)}</span></div>
        {total > 0 ? (
          <>
            <div className="fin-barra">
              {conMonto.map((p) => (
                <i key={p.nombre} style={{ width: `${(p.monto / total) * 100}%`, background: p.color }} title={`${p.nombre}: ${formatoMoneda(p.monto)}`} />
              ))}
            </div>
            <ul>
              {[...conMonto].sort((a, b) => b.monto - a.monto).map((p) => (
                <li key={p.nombre}>
                  <i style={{ background: p.color }} />
                  <span>{p.nombre}</span>
                  <small>{Math.round((p.monto / total) * 100)}%</small>
                  <b>{formatoMoneda(p.monto)}</b>
                </li>
              ))}
            </ul>
          </>
        ) : <p className="fin-vacio">Nada este mes.</p>}
      </div>
    );
  };

  const partesEntrada = Object.entries(FUENTES).map(([k, f]) => ({ nombre: f.nombre, color: f.color, monto: mes.entradas[k] }));
  const partesSalida = Object.entries(mes.salidas).map(([cat, monto]) => ({
    nombre: cat, monto, color: COLORES_GASTO[Math.max(0, CATEGORIAS_GASTO.indexOf(cat))],
  }));

  const formulario = formCobro ? (
    <div className="fin-form">
      <h4>{editandoCobroId ? "Editar cobro" : "Nuevo cobro"} <small>algo que no sea un turno fijo: una evaluación suelta, un informe…</small></h4>
      <div className="fin-form-fila">
        <select value={formCobro.paciente_id} onChange={(e) => setFormCobro({ ...formCobro, paciente_id: e.target.value })}>
          <option value="">Sin paciente</option>
          {pacientes.map((p) => <option key={p.id} value={p.id}>{nombrePaciente(p)}</option>)}
        </select>
        <input placeholder="Concepto (ej: Evaluación, Informe)" value={formCobro.concepto} onChange={(e) => setFormCobro({ ...formCobro, concepto: e.target.value })} />
      </div>
      <div className="fin-form-fila">
        <input type="number" min="0" placeholder="Monto" value={formCobro.monto} onChange={(e) => setFormCobro({ ...formCobro, monto: e.target.value })} />
        <input type="date" value={formCobro.fecha} onChange={(e) => setFormCobro({ ...formCobro, fecha: e.target.value })} />
      </div>
      <input placeholder="Notas (opcional)" value={formCobro.notas} onChange={(e) => setFormCobro({ ...formCobro, notas: e.target.value })} />
      <div className="fin-form-acciones">
        <button className="fin-btn" onClick={() => { setFormCobro(null); setEditandoCobroId(null); }}>Cancelar</button>
        <button className="fin-btn pri" onClick={guardarCobro}>Guardar</button>
      </div>
    </div>
  ) : formGasto ? (
    <div className="fin-form">
      <h4>{editandoGastoId ? "Editar gasto" : "Nuevo gasto"}</h4>
      <div className="fin-form-fila">
        <input placeholder="Concepto (ej: Alquiler)" value={formGasto.concepto} onChange={(e) => setFormGasto({ ...formGasto, concepto: e.target.value })} />
        <select value={formGasto.categoria} onChange={(e) => setFormGasto({ ...formGasto, categoria: e.target.value })}>
          {CATEGORIAS_GASTO.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="fin-form-fila">
        <input type="number" min="0" placeholder="Monto" value={formGasto.monto} onChange={(e) => setFormGasto({ ...formGasto, monto: e.target.value })} />
        <input type="date" value={formGasto.fecha} onChange={(e) => setFormGasto({ ...formGasto, fecha: e.target.value })} />
      </div>
      <label className="fin-check">
        <input type="checkbox" checked={formGasto.recurrente} onChange={(e) => setFormGasto({ ...formGasto, recurrente: e.target.checked })} />
        Es un gasto fijo (aparece en "Falta pagar" los meses que no se cargue)
      </label>
      <input placeholder="Notas (opcional)" value={formGasto.notas} onChange={(e) => setFormGasto({ ...formGasto, notas: e.target.value })} />
      <div className="fin-form-acciones">
        <button className="fin-btn" onClick={() => { setFormGasto(null); setEditandoGastoId(null); }}>Cancelar</button>
        <button className="fin-btn pri" onClick={guardarGasto}>Guardar</button>
      </div>
    </div>
  ) : null;

  return (
    <div className="fin">
      <div className="fin-top">
        <SelectorMes anio={vista.anio} mes={vista.mes} onCambiar={(anio, m) => setVista({ anio, mes: m })} />
        <div className="fin-top-acciones">
          <button className="fin-btn" onClick={abrirNuevoCobro}><FaPlus /> Cobro</button>
          <button className="fin-btn" onClick={abrirNuevoGasto}><FaPlus /> Gasto</button>
        </div>
      </div>

      {formulario}

      {/* Entró / Salió / Te quedó */}
      <div className="fin-kpis">
        {tarjeta("Entró", mes.entro, "entro", comparar(mes.entro, anterior.entro, true))}
        {tarjeta("Salió", mes.salio, "salio", comparar(mes.salio, anterior.salio, false))}
        {tarjeta("Te quedó", mes.quedo, mes.quedo >= 0 ? "quedo" : "quedo negativo", null)}
      </div>

      <div className="fin-dos">
        {barraPartes("De dónde vino", partesEntrada, mes.entro)}
        {barraPartes("En qué se fue", partesSalida, mes.salio)}
      </div>

      {/* Pendientes */}
      {(porCobrar.length > 0 || porPagar.length > 0) && (
        <div className="fin-dos">
          <div className="fin-pend">
            <b>Te deben las obras sociales</b>
            {porCobrar.length === 0 ? <p className="fin-vacio">Nada pendiente.</p> : porCobrar.map((g) => (
              <div key={g.clave} className="fin-pend-item">
                <span>
                  <strong>{g.nombre}</strong>
                  <small>{g.cantidad} sesi{g.cantidad === 1 ? "ón" : "ones"} · se cobra {g.desde === g.hasta ? `el ${fechaCorta(g.desde)}` : `del ${fechaCorta(g.desde)} al ${fechaCorta(g.hasta)}`}</small>
                </span>
                <b className="verde">{formatoMoneda(g.total)}</b>
              </div>
            ))}
          </div>
          <div className="fin-pend">
            <b>Falta pagar este mes</b>
            {porPagar.length === 0 ? <p className="fin-vacio">Todos los gastos fijos están cargados.</p> : porPagar.map((g) => (
              <div key={g.id} className="fin-pend-item">
                <span>
                  <strong>{g.concepto}</strong>
                  <small>La última vez: {formatoMoneda(g.monto)}</small>
                </span>
                <button className="fin-btn chico" onClick={() => yaLoPague(g)}>Ya lo pagué</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Movimientos del mes */}
      <div className="fin-movs">
        <div className="fin-movs-cab">
          <b>Movimientos del mes</b>
          <div className="fin-chips">
            {[["todo", "Todo"], ["entradas", "Entradas"], ["salidas", "Salidas"]].map(([k, t]) => (
              <button key={k} className={filtro === k ? "on" : ""} onClick={() => setFiltro(k)}>{t}</button>
            ))}
          </div>
        </div>
        {movimientos.length === 0 && <p className="fin-vacio">No hay movimientos este mes.</p>}
        {movimientos.map(([fecha, items]) => {
          const f = deClave(fecha);
          return (
            <div key={fecha} className="fin-dia">
              <div className="fin-dia-cab">{DIAS[f.getDay()]} {f.getDate()} de {MESES[f.getMonth()]}</div>
              {items.map((m) => (
                <div key={m.clave} className="fin-mov">
                  <i className="fin-mov-icono" style={{ background: m.color }}>{m.entrada ? <FaArrowDown /> : <FaArrowUp />}</i>
                  <span className="fin-mov-texto">
                    <strong>{m.titulo}</strong>
                    {m.detalle && <small>{m.detalle}</small>}
                  </span>
                  <b className={m.entrada ? "verde" : "rojo"}>{m.entrada ? "+" : "−"}{formatoMoneda(m.monto)}</b>
                  {(m.cobro || m.gasto) && (
                    <span className="fin-mov-acciones">
                      <button onClick={() => (m.cobro ? abrirEdicionCobro(m.cobro) : abrirEdicionGasto(m.gasto))} aria-label="Editar"><FaEdit /></button>
                      <button onClick={() => (m.cobro ? eliminar("cobros", m.cobro, "cobro") : eliminar("gastos", m.gasto, "gasto"))} aria-label="Eliminar"><FaTrash /></button>
                    </span>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
