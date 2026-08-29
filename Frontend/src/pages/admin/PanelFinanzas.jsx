import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabase/supabaseClient";
import Swal from "sweetalert2";
import { FaPlus, FaTrash, FaEdit } from "react-icons/fa";
import "./panelFinanzas.css";

const formatoMoneda = (n) => `$${Number(n || 0).toLocaleString("es-AR")}`;
const pad2 = (n) => String(n).padStart(2, "0");
const claveDia = (f) => f; // ya viene como "YYYY-MM-DD"
const claveMes = (f) => f.slice(0, 7);
const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const NOMBRES_MES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const CATEGORIAS_GASTO = ["Monotributo", "Alquiler", "Servicios", "Insumos", "Impuestos", "Otro"];

const COBRO_VACIO = { paciente_id: "", concepto: "Sesión", monto: "", fecha: hoyISO(), notas: "" };
const GASTO_VACIO = { concepto: "", categoria: "Otro", monto: "", fecha: hoyISO(), recurrente: false, frecuencia: "mensual", notas: "" };

export default function PanelFinanzas() {
  const [cobros, setCobros] = useState([]);
  const [gastos, setGastos] = useState([]);
  const [pacientes, setPacientes] = useState([]);
  const [cargando, setCargando] = useState(true);

  const hoy = new Date();
  const [anio, setAnio] = useState(String(hoy.getFullYear()));
  const [mes, setMes] = useState(String(hoy.getMonth() + 1)); // "" = todo el año

  const [formCobro, setFormCobro] = useState(null); // null = form cerrado
  const [editandoCobroId, setEditandoCobroId] = useState(null);
  const [formGasto, setFormGasto] = useState(null);
  const [editandoGastoId, setEditandoGastoId] = useState(null);

  useEffect(() => { cargarTodo(); }, []);

  const cargarTodo = async () => {
    setCargando(true);
    const [{ data: cobrosData }, { data: gastosData }, { data: pacientesData }] = await Promise.all([
      supabase.from("cobros").select("*, pacientes(nombre, apellido)").order("fecha", { ascending: false }),
      supabase.from("gastos").select("*").order("fecha", { ascending: false }),
      supabase.from("pacientes").select("id, nombre, apellido, activo, monto_personalizado, obras_sociales(precio_hora)").order("nombre"),
    ]);
    setCobros(cobrosData || []);
    setGastos(gastosData || []);
    setPacientes(pacientesData || []);
    setCargando(false);
  };

  const aniosDisponibles = useMemo(() => {
    const set = new Set([
      ...cobros.map((c) => Number(c.fecha.slice(0, 4))),
      ...gastos.map((g) => Number(g.fecha.slice(0, 4))),
    ]);
    set.add(hoy.getFullYear());
    return [...set].sort((a, b) => b - a);
  }, [cobros, gastos]);

  const rango = useMemo(() => {
    const anioNum = Number(anio);
    if (mes) {
      const mesNum = Number(mes);
      return { desde: `${anioNum}-${pad2(mesNum)}-01`, hasta: `${anioNum}-${pad2(mesNum)}-31` };
    }
    return { desde: `${anioNum}-01-01`, hasta: `${anioNum}-12-31` };
  }, [anio, mes]);

  const cobrosFiltrados = useMemo(
    () => cobros.filter((c) => c.fecha >= rango.desde && c.fecha <= rango.hasta),
    [cobros, rango]
  );
  const gastosFiltrados = useMemo(
    () => gastos.filter((g) => g.fecha >= rango.desde && g.fecha <= rango.hasta),
    [gastos, rango]
  );

  const resumen = useMemo(() => {
    const totalIngresos = cobrosFiltrados.reduce((acc, c) => acc + Number(c.monto || 0), 0);
    const totalGastos = gastosFiltrados.reduce((acc, g) => acc + Number(g.monto || 0), 0);
    return { totalIngresos, totalGastos, balance: totalIngresos - totalGastos };
  }, [cobrosFiltrados, gastosFiltrados]);

  // Gráfico: agrupa por mes si el año está completo (12 puntos), por día
  // si se eligió un mes puntual -- misma lógica que Ventas, pero acá
  // siempre mostramos las dos series (ingreso/gasto) juntas por columna.
  const grafico = useMemo(() => {
    const porMes = !mes;
    const buckets = new Map();
    const sumar = (fecha, monto, tipo) => {
      const clave = porMes ? claveMes(fecha) : claveDia(fecha);
      if (!buckets.has(clave)) buckets.set(clave, { ingreso: 0, gasto: 0 });
      buckets.get(clave)[tipo] += Number(monto || 0);
    };
    cobrosFiltrados.forEach((c) => sumar(c.fecha, c.monto, "ingreso"));
    gastosFiltrados.forEach((g) => sumar(g.fecha, g.monto, "gasto"));

    const puntos = [...buckets.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([clave, valores]) => ({
        etiqueta: porMes ? NOMBRES_MES[Number(clave.split("-")[1]) - 1].slice(0, 3) : clave.split("-")[2],
        ...valores,
      }));
    return puntos;
  }, [cobrosFiltrados, gastosFiltrados, mes]);

  const maxValorGrafico = Math.max(1, ...grafico.map((p) => Math.max(p.ingreso, p.gasto)));

  // Recordatorios de gastos recurrentes: por cada concepto marcado como
  // recurrente, se fija en el registro más reciente para saber el monto
  // sugerido, y avisa si todavía no se cargó nada de ese concepto en el
  // mes CALENDARIO actual (no depende del filtro de arriba -- son un
  // aviso de "esto es lo que falta pagar/cargar ahora").
  const recordatorios = useMemo(() => {
    const mesActual = hoyISO().slice(0, 7);
    const porConcepto = new Map();
    gastos
      .filter((g) => g.recurrente)
      .forEach((g) => {
        const clave = (g.concepto || "").trim().toLowerCase();
        const actual = porConcepto.get(clave);
        if (!actual || g.fecha > actual.fecha) porConcepto.set(clave, g);
      });
    return [...porConcepto.values()].filter((g) => g.fecha.slice(0, 7) !== mesActual);
  }, [gastos]);

  // ---------- Cobros ----------
  const sugerirMontoPaciente = (pacienteId) => {
    const p = pacientes.find((x) => x.id === pacienteId);
    if (!p) return "";
    return p.monto_personalizado ?? p.obras_sociales?.precio_hora ?? "";
  };

  const abrirNuevoCobro = () => {
    setFormCobro(COBRO_VACIO);
    setEditandoCobroId(null);
  };

  const abrirEdicionCobro = (c) => {
    setFormCobro({
      paciente_id: c.paciente_id || "",
      concepto: c.concepto || "",
      monto: c.monto,
      fecha: c.fecha,
      notas: c.notas || "",
    });
    setEditandoCobroId(c.id);
  };

  const abrirCobroRecordatorio = (nombreConcepto, montoSugerido) => {
    setFormGasto({ ...GASTO_VACIO, concepto: nombreConcepto, monto: montoSugerido, recurrente: true });
    setEditandoGastoId(null);
  };

  const guardarCobro = async () => {
    if (!formCobro.monto || Number(formCobro.monto) <= 0) {
      Swal.fire("Falta el monto", "Cargá cuánto se cobró.", "warning");
      return;
    }
    const payload = {
      paciente_id: formCobro.paciente_id || null,
      concepto: formCobro.concepto || null,
      monto: Number(formCobro.monto),
      fecha: formCobro.fecha || hoyISO(),
      notas: formCobro.notas || null,
    };
    let error;
    if (editandoCobroId) {
      ({ error } = await supabase.from("cobros").update(payload).eq("id", editandoCobroId));
    } else {
      ({ error } = await supabase.from("cobros").insert([payload]));
    }
    if (error) { Swal.fire("Error", "No se pudo guardar el cobro.", "error"); return; }
    setFormCobro(null);
    setEditandoCobroId(null);
    cargarTodo();
  };

  const eliminarCobro = async (c) => {
    const res = await Swal.fire({
      title: "¿Eliminar este cobro?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#D48CA6",
      confirmButtonText: "Eliminar",
      cancelButtonText: "Cancelar",
    });
    if (!res.isConfirmed) return;
    await supabase.from("cobros").delete().eq("id", c.id);
    cargarTodo();
  };

  // ---------- Gastos ----------
  const abrirNuevoGasto = () => {
    setFormGasto(GASTO_VACIO);
    setEditandoGastoId(null);
  };

  const abrirEdicionGasto = (g) => {
    setFormGasto({
      concepto: g.concepto || "",
      categoria: g.categoria || "Otro",
      monto: g.monto,
      fecha: g.fecha,
      recurrente: !!g.recurrente,
      frecuencia: g.frecuencia || "mensual",
      notas: g.notas || "",
    });
    setEditandoGastoId(g.id);
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
    let error;
    if (editandoGastoId) {
      ({ error } = await supabase.from("gastos").update(payload).eq("id", editandoGastoId));
    } else {
      ({ error } = await supabase.from("gastos").insert([payload]));
    }
    if (error) { Swal.fire("Error", "No se pudo guardar el gasto.", "error"); return; }
    setFormGasto(null);
    setEditandoGastoId(null);
    cargarTodo();
  };

  const eliminarGasto = async (g) => {
    const res = await Swal.fire({
      title: "¿Eliminar este gasto?",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#D48CA6",
      confirmButtonText: "Eliminar",
      cancelButtonText: "Cancelar",
    });
    if (!res.isConfirmed) return;
    await supabase.from("gastos").delete().eq("id", g.id);
    cargarTodo();
  };

  const nombrePaciente = (c) => c.pacientes ? `${c.pacientes.nombre} ${c.pacientes.apellido}` : (c.concepto || "Ingreso");

  if (cargando) return <div className="fin-panel"><p className="fin-cargando">Cargando finanzas...</p></div>;

  return (
    <div className="fin-panel">
      <div className="fin-filtros">
        <div className="fin-filtro-grupo">
          <label>Año</label>
          <select value={anio} onChange={(e) => setAnio(e.target.value)}>
            {aniosDisponibles.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="fin-filtro-grupo">
          <label>Mes</label>
          <select value={mes} onChange={(e) => setMes(e.target.value)}>
            <option value="">Todo el año</option>
            {NOMBRES_MES.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
          </select>
        </div>
      </div>

      <div className="fin-resumen">
        <div className="fin-resumen-card">
          <span className="fin-resumen-valor positivo">{formatoMoneda(resumen.totalIngresos)}</span>
          <span className="fin-resumen-label">Ingresos del período</span>
        </div>
        <div className="fin-resumen-card">
          <span className="fin-resumen-valor negativo">{formatoMoneda(resumen.totalGastos)}</span>
          <span className="fin-resumen-label">Gastos del período</span>
        </div>
        <div className="fin-resumen-card">
          <span className={`fin-resumen-valor ${resumen.balance >= 0 ? "positivo" : "negativo"}`}>{formatoMoneda(resumen.balance)}</span>
          <span className="fin-resumen-label">Balance (gana a fin de mes)</span>
        </div>
      </div>

      {recordatorios.length > 0 && (
        <div className="fin-recordatorios">
          {recordatorios.map((g) => (
            <div key={g.concepto.toLowerCase()} className="fin-recordatorio-chip">
              Todavía no cargaste "{g.concepto}" este mes (última vez: {formatoMoneda(g.monto)})
              <button onClick={() => abrirCobroRecordatorio(g.concepto, g.monto)} title="Cargar este mes">+</button>
            </div>
          ))}
        </div>
      )}

      <div className="fin-grafico-card">
        <div className="fin-grafico-leyenda">
          <span><i className="fin-leyenda-ingreso" /> Ingresos</span>
          <span><i className="fin-leyenda-gasto" /> Gastos</span>
        </div>
        {grafico.length === 0 ? (
          <p className="fin-sin-datos">No hay movimientos en este período.</p>
        ) : (
          <div className="fin-grafico">
            {grafico.map((p, i) => (
              <div key={i} className="fin-barra-col">
                <div className="fin-barras-par">
                  <div className="fin-barra ingreso" style={{ height: `${Math.max(3, (p.ingreso / maxValorGrafico) * 140)}px` }} title={formatoMoneda(p.ingreso)} />
                  <div className="fin-barra gasto" style={{ height: `${Math.max(3, (p.gasto / maxValorGrafico) * 140)}px` }} title={formatoMoneda(p.gasto)} />
                </div>
                <span className="fin-barra-etiqueta">{p.etiqueta}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="fin-columnas">
        {/* ---------- Ingresos ---------- */}
        <div className="fin-columna">
          <div className="fin-columna-header">
            <h3>Ingresos</h3>
            <button className="fin-btn-agregar" onClick={abrirNuevoCobro}><FaPlus /> Registrar cobro</button>
          </div>

          {formCobro && (
            <div className="fin-form">
              <select value={formCobro.paciente_id} onChange={(e) => {
                const pacienteId = e.target.value;
                setFormCobro((f) => ({ ...f, paciente_id: pacienteId, monto: f.monto || sugerirMontoPaciente(pacienteId) }));
              }}>
                <option value="">Sin paciente asociado</option>
                {pacientes.map((p) => (
                  <option key={p.id} value={p.id}>{p.nombre} {p.apellido}{!p.activo ? " (inactivo)" : ""}</option>
                ))}
              </select>
              <div className="fin-form-fila">
                <input type="number" placeholder="Monto" value={formCobro.monto} onChange={(e) => setFormCobro({ ...formCobro, monto: e.target.value })} />
                <input type="date" value={formCobro.fecha} onChange={(e) => setFormCobro({ ...formCobro, fecha: e.target.value })} />
              </div>
              <input placeholder="Concepto (ej: Sesión, Evaluación)" value={formCobro.concepto} onChange={(e) => setFormCobro({ ...formCobro, concepto: e.target.value })} />
              <input placeholder="Notas (opcional)" value={formCobro.notas} onChange={(e) => setFormCobro({ ...formCobro, notas: e.target.value })} />
              <div className="fin-form-acciones">
                <button className="fin-btn-guardar" onClick={guardarCobro}>Guardar</button>
                <button className="fin-btn-cancelar" onClick={() => { setFormCobro(null); setEditandoCobroId(null); }}>Cancelar</button>
              </div>
            </div>
          )}

          <div className="fin-lista">
            {cobrosFiltrados.length === 0 && <p className="fin-sin-datos">No hay cobros en este período.</p>}
            {cobrosFiltrados.map((c) => (
              <div key={c.id} className="fin-item">
                <div className="fin-item-info">
                  <strong>{nombrePaciente(c)}</strong>
                  <span className="fin-item-sub">{c.concepto && c.pacientes ? `${c.concepto} · ` : ""}{new Date(`${c.fecha}T00:00:00`).toLocaleDateString("es-AR")}</span>
                </div>
                <div className="fin-item-derecha">
                  <span className="fin-item-monto ingreso">{formatoMoneda(c.monto)}</span>
                  <div className="fin-item-acciones">
                    <button onClick={() => abrirEdicionCobro(c)}><FaEdit /></button>
                    <button className="fin-btn-borrar" onClick={() => eliminarCobro(c)}><FaTrash /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ---------- Gastos ---------- */}
        <div className="fin-columna">
          <div className="fin-columna-header">
            <h3>Gastos</h3>
            <button className="fin-btn-agregar" onClick={abrirNuevoGasto}><FaPlus /> Registrar gasto</button>
          </div>

          {formGasto && (
            <div className="fin-form">
              <div className="fin-form-fila">
                <input placeholder="Concepto (ej: Alquiler)" value={formGasto.concepto} onChange={(e) => setFormGasto({ ...formGasto, concepto: e.target.value })} />
                <select value={formGasto.categoria} onChange={(e) => setFormGasto({ ...formGasto, categoria: e.target.value })}>
                  {CATEGORIAS_GASTO.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="fin-form-fila">
                <input type="number" placeholder="Monto" value={formGasto.monto} onChange={(e) => setFormGasto({ ...formGasto, monto: e.target.value })} />
                <input type="date" value={formGasto.fecha} onChange={(e) => setFormGasto({ ...formGasto, fecha: e.target.value })} />
              </div>
              <label className="fin-form-checkbox">
                <input type="checkbox" checked={formGasto.recurrente} onChange={(e) => setFormGasto({ ...formGasto, recurrente: e.target.checked })} />
                Es un gasto recurrente (avisa si falta cargarlo en el mes)
              </label>
              {formGasto.recurrente && (
                <select value={formGasto.frecuencia} onChange={(e) => setFormGasto({ ...formGasto, frecuencia: e.target.value })}>
                  <option value="mensual">Mensual</option>
                  <option value="quincenal">Quincenal</option>
                  <option value="anual">Anual</option>
                </select>
              )}
              <input placeholder="Notas (opcional)" value={formGasto.notas} onChange={(e) => setFormGasto({ ...formGasto, notas: e.target.value })} />
              <div className="fin-form-acciones">
                <button className="fin-btn-guardar" onClick={guardarGasto}>Guardar</button>
                <button className="fin-btn-cancelar" onClick={() => { setFormGasto(null); setEditandoGastoId(null); }}>Cancelar</button>
              </div>
            </div>
          )}

          <div className="fin-lista">
            {gastosFiltrados.length === 0 && <p className="fin-sin-datos">No hay gastos en este período.</p>}
            {gastosFiltrados.map((g) => (
              <div key={g.id} className="fin-item">
                <div className="fin-item-info">
                  <strong>{g.concepto}</strong>
                  <span className="fin-item-sub">
                    <span className="fin-tag-categoria">{g.categoria}</span>
                    {g.recurrente && <span className="fin-tag-recurrente">{g.frecuencia}</span>}
                    {new Date(`${g.fecha}T00:00:00`).toLocaleDateString("es-AR")}
                  </span>
                </div>
                <div className="fin-item-derecha">
                  <span className="fin-item-monto gasto">{formatoMoneda(g.monto)}</span>
                  <div className="fin-item-acciones">
                    <button onClick={() => abrirEdicionGasto(g)}><FaEdit /></button>
                    <button className="fin-btn-borrar" onClick={() => eliminarGasto(g)}><FaTrash /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
