import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabase/supabaseClient";
import Swal from "sweetalert2";
import { FaTrash, FaUserCheck, FaUserSlash, FaSearch } from "react-icons/fa";
import "./panelVentas.css";

const formatoMoneda = (n) => `$${Number(n || 0).toLocaleString("es-AR")}`;
const pad2 = (n) => String(n).padStart(2, "0");
const aFechaLocal = (iso) => new Date(iso);
const claveDia = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const claveMes = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;

const NOMBRES_MES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export default function PanelVentas() {
  const [compras, setCompras] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [eliminandoId, setEliminandoId] = useState(null);

  const hoy = new Date();
  const [anio, setAnio] = useState(String(hoy.getFullYear()));
  const [mes, setMes] = useState(String(hoy.getMonth() + 1)); // "" = todo el año
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    cargarVentas();
  }, []);

  const cargarVentas = async () => {
    setCargando(true);
    const { data } = await supabase
      .from("compras")
      .select("id, fecha, material_id, nombre_material, nombre_usuario, email_usuario, usuario_id, precio_pagado, status")
      .eq("status", "approved")
      .order("fecha", { ascending: false });
    setCompras(data || []);
    setCargando(false);
  };

  // Años disponibles según las ventas reales que hay -- si no hay ninguna
  // todavía, al menos el año actual para no dejar el selector vacío.
  const aniosDisponibles = useMemo(() => {
    const set = new Set(compras.map((c) => aFechaLocal(c.fecha).getFullYear()));
    set.add(hoy.getFullYear());
    return [...set].sort((a, b) => b - a);
  }, [compras]);

  // Rango de fechas activo: si se cargó un "desde"/"hasta" a mano, manda
  // eso (modo comparación libre); si no, se arma solo a partir de
  // año + mes (mes vacío = año completo).
  const rango = useMemo(() => {
    if (desde && hasta) {
      return { inicio: new Date(`${desde}T00:00:00`), fin: new Date(`${hasta}T23:59:59`) };
    }
    const anioNum = Number(anio);
    if (mes) {
      const mesNum = Number(mes);
      return {
        inicio: new Date(anioNum, mesNum - 1, 1, 0, 0, 0),
        fin: new Date(anioNum, mesNum, 0, 23, 59, 59),
      };
    }
    return { inicio: new Date(anioNum, 0, 1, 0, 0, 0), fin: new Date(anioNum, 11, 31, 23, 59, 59) };
  }, [anio, mes, desde, hasta]);

  const ventasFiltradas = useMemo(() => {
    const busq = busqueda.trim().toLowerCase();
    return compras.filter((c) => {
      const f = aFechaLocal(c.fecha);
      if (f < rango.inicio || f > rango.fin) return false;
      if (!busq) return true;
      return (
        (c.nombre_material || "").toLowerCase().includes(busq) ||
        (c.nombre_usuario || "").toLowerCase().includes(busq) ||
        (c.email_usuario || "").toLowerCase().includes(busq)
      );
    });
  }, [compras, rango, busqueda]);

  const resumen = useMemo(() => {
    const total = ventasFiltradas.reduce((acc, c) => acc + Number(c.precio_pagado || 0), 0);
    const cantidad = ventasFiltradas.length;
    return { total, cantidad, promedio: cantidad ? total / cantidad : 0 };
  }, [ventasFiltradas]);

  // Si el rango activo dura más de ~2 meses agrupa por mes (si no, el
  // gráfico quedaría con demasiadas barras finitas para leer algo); si es
  // más corto, agrupa por día para ver el detalle real.
  const grafico = useMemo(() => {
    const diasDeRango = (rango.fin - rango.inicio) / (1000 * 60 * 60 * 24);
    const porMes = diasDeRango > 62;
    const buckets = new Map();
    ventasFiltradas.forEach((c) => {
      const f = aFechaLocal(c.fecha);
      const clave = porMes ? claveMes(f) : claveDia(f);
      buckets.set(clave, (buckets.get(clave) || 0) + Number(c.precio_pagado || 0));
    });
    const puntos = [...buckets.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([clave, valor]) => ({
        etiqueta: porMes
          ? NOMBRES_MES[Number(clave.split("-")[1]) - 1].slice(0, 3)
          : clave.split("-")[2],
        valor,
      }));
    return { puntos, porMes };
  }, [ventasFiltradas, rango]);

  const limpiarRangoLibre = () => { setDesde(""); setHasta(""); };

  const eliminarVenta = async (compra) => {
    const res = await Swal.fire({
      title: "¿Eliminar esta venta?",
      html: `<strong>${compra.nombre_material}</strong><br/>${compra.nombre_usuario || compra.email_usuario}<br/>Esto la saca del historial y del contador de ventas del material -- no se puede deshacer.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#D48CA6",
      confirmButtonText: "Sí, eliminar",
    });
    if (!res.isConfirmed) return;

    setEliminandoId(compra.id);
    try {
      const { error } = await supabase.from("compras").delete().eq("id", compra.id);
      if (error) throw error;
      setCompras((prev) => prev.filter((c) => c.id !== compra.id));
    } catch (err) {
      Swal.fire("Error", "No se pudo eliminar la venta.", "error");
    } finally {
      setEliminandoId(null);
    }
  };

  const maxValor = Math.max(1, ...grafico.puntos.map((p) => p.valor));

  return (
    <div className="ventas-panel">
      <div className="ventas-filtros">
        <div className="ventas-filtro-grupo">
          <label>Año</label>
          <select value={anio} onChange={(e) => { setAnio(e.target.value); limpiarRangoLibre(); }} disabled={!!(desde && hasta)}>
            {aniosDisponibles.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div className="ventas-filtro-grupo">
          <label>Mes</label>
          <select value={mes} onChange={(e) => { setMes(e.target.value); limpiarRangoLibre(); }} disabled={!!(desde && hasta)}>
            <option value="">Todo el año</option>
            {NOMBRES_MES.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
          </select>
        </div>
        <div className="ventas-filtro-grupo">
          <label>Desde</label>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </div>
        <div className="ventas-filtro-grupo">
          <label>Hasta</label>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </div>
        {(desde || hasta) && (
          <button className="ventas-btn-limpiar" onClick={limpiarRangoLibre}>Usar año/mes</button>
        )}
        <div className="ventas-filtro-grupo ventas-buscador">
          <label><FaSearch /> Buscar</label>
          <input type="text" placeholder="Material, nombre o email..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </div>
      </div>

      {cargando ? (
        <p className="ventas-cargando">Cargando ventas...</p>
      ) : (
        <>
          <div className="ventas-resumen">
            <div className="ventas-resumen-card">
              <span className="ventas-resumen-valor">{formatoMoneda(resumen.total)}</span>
              <span className="ventas-resumen-label">Total del período elegido</span>
            </div>
            <div className="ventas-resumen-card">
              <span className="ventas-resumen-valor">{resumen.cantidad}</span>
              <span className="ventas-resumen-label">Ventas</span>
            </div>
            <div className="ventas-resumen-card">
              <span className="ventas-resumen-valor">{formatoMoneda(resumen.promedio)}</span>
              <span className="ventas-resumen-label">Promedio por venta</span>
            </div>
          </div>

          <div className="ventas-grafico-card">
            {grafico.puntos.length === 0 ? (
              <p className="ventas-sin-datos">No hay ventas en este período.</p>
            ) : (
              <div className="ventas-grafico">
                {grafico.puntos.map((p, i) => (
                  <div key={i} className="ventas-barra-col">
                    <span className="ventas-barra-valor">{p.valor > 0 ? formatoMoneda(p.valor) : ""}</span>
                    <div className="ventas-barra" style={{ height: `${Math.max(4, (p.valor / maxValor) * 140)}px` }} />
                    <span className="ventas-barra-etiqueta">{p.etiqueta}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="ventas-lista">
            {ventasFiltradas.length === 0 ? (
              <p className="ventas-sin-datos">No hay ventas que coincidan.</p>
            ) : (
              ventasFiltradas.map((c) => (
                <div key={c.id} className="ventas-item">
                  <div className="ventas-item-info">
                    <strong>{c.nombre_material}</strong>
                    <span className="ventas-item-comprador">
                      {c.usuario_id ? <FaUserCheck className="ventas-icono-cuenta" /> : <FaUserSlash className="ventas-icono-invitado" />}
                      {c.nombre_usuario || "(sin nombre)"} · {c.email_usuario}
                    </span>
                    <span className="ventas-item-fecha">
                      {aFechaLocal(c.fecha).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                      {" · "}
                      <span className={c.usuario_id ? "ventas-tag-cuenta" : "ventas-tag-invitado"}>
                        {c.usuario_id ? "Con cuenta" : "Invitado"}
                      </span>
                    </span>
                  </div>
                  <div className="ventas-item-derecha">
                    <span className="ventas-item-precio">{formatoMoneda(c.precio_pagado)}</span>
                    <button
                      className="ventas-btn-eliminar"
                      onClick={() => eliminarVenta(c)}
                      disabled={eliminandoId === c.id}
                      title="Eliminar esta venta"
                    >
                      <FaTrash />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
