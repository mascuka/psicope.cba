import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../../supabase/supabaseClient";
import Swal from "sweetalert2";
import { FaTrash, FaUserCheck, FaUserSlash, FaSearch, FaSlidersH } from "react-icons/fa";
import SelectorMes from "./SelectorMes";
import "./panelVentas.css";

/*
 * Ventas de materiales de la web: las del mes (o de un rango libre, desde
 * "Más opciones"), con los totales, los materiales más vendidos y la lista
 * por día.
 */

const formatoMoneda = (n) => `$${Math.round(Number(n || 0)).toLocaleString("es-AR")}`;
const pad2 = (n) => String(n).padStart(2, "0");
const claveDia = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export default function PanelVentas() {
  const [compras, setCompras] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [eliminandoId, setEliminandoId] = useState(null);

  const hoy = new Date();
  const [vista, setVista] = useState({ anio: hoy.getFullYear(), mes: hoy.getMonth() });
  const [masOpciones, setMasOpciones] = useState(false);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => {
    supabase
      .from("compras")
      .select("id, fecha, material_id, nombre_material, nombre_usuario, email_usuario, usuario_id, precio_pagado, status")
      .eq("status", "approved")
      .order("fecha", { ascending: false })
      .then(({ data }) => {
        setCompras(data || []);
        setCargando(false);
      });
  }, []);

  // Rango libre (desde "Más opciones") si están las dos fechas; si no, el mes elegido.
  const rangoLibre = masOpciones && desde && hasta;
  const rango = useMemo(() => rangoLibre
    ? { inicio: new Date(`${desde}T00:00:00`), fin: new Date(`${hasta}T23:59:59`) }
    : { inicio: new Date(vista.anio, vista.mes, 1), fin: new Date(vista.anio, vista.mes + 1, 0, 23, 59, 59) },
  [rangoLibre, desde, hasta, vista]);

  const ventasFiltradas = useMemo(() => {
    const busq = busqueda.trim().toLowerCase();
    return compras.filter((c) => {
      const f = new Date(c.fecha);
      if (f < rango.inicio || f > rango.fin) return false;
      if (!busq) return true;
      return [c.nombre_material, c.nombre_usuario, c.email_usuario].some((t) => (t || "").toLowerCase().includes(busq));
    });
  }, [compras, rango, busqueda]);

  const resumen = useMemo(() => {
    const total = ventasFiltradas.reduce((acc, c) => acc + Number(c.precio_pagado || 0), 0);
    const cantidad = ventasFiltradas.length;
    return { total, cantidad, promedio: cantidad ? total / cantidad : 0 };
  }, [ventasFiltradas]);

  // Los materiales más vendidos del período.
  const ranking = useMemo(() => {
    const porMaterial = new Map();
    ventasFiltradas.forEach((c) => {
      const clave = c.material_id || c.nombre_material;
      if (!porMaterial.has(clave)) porMaterial.set(clave, { nombre: c.nombre_material || "Material", cantidad: 0, total: 0 });
      const m = porMaterial.get(clave);
      m.cantidad++;
      m.total += Number(c.precio_pagado || 0);
    });
    return [...porMaterial.values()].sort((a, b) => b.total - a.total || b.cantidad - a.cantidad).slice(0, 6);
  }, [ventasFiltradas]);
  const maxRanking = Math.max(1, ...ranking.map((m) => m.total));

  // La lista, separada por día.
  const porDia = useMemo(() => {
    const dias = new Map();
    ventasFiltradas.forEach((c) => {
      const k = claveDia(new Date(c.fecha));
      if (!dias.has(k)) dias.set(k, []);
      dias.get(k).push(c);
    });
    return [...dias.entries()];
  }, [ventasFiltradas]);

  const eliminarVenta = async (compra) => {
    const res = await Swal.fire({
      title: "¿Eliminar esta venta?",
      html: `<strong>${compra.nombre_material}</strong><br/>${compra.nombre_usuario || compra.email_usuario}<br/>Esto la saca del historial y del contador de ventas del material -- no se puede deshacer.`,
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#D48CA6",
      confirmButtonText: "Sí, eliminar",
      cancelButtonText: "Cancelar",
    });
    if (!res.isConfirmed) return;

    setEliminandoId(compra.id);
    const { error } = await supabase.from("compras").delete().eq("id", compra.id);
    setEliminandoId(null);
    if (error) { Swal.fire("Error", "No se pudo eliminar la venta.", "error"); return; }
    setCompras((prev) => prev.filter((c) => c.id !== compra.id));
  };

  return (
    <div className="ventas">
      <div className="ventas-top">
        {rangoLibre
          ? <b className="ventas-rango">Del {desde.split("-").reverse().join("/")} al {hasta.split("-").reverse().join("/")}</b>
          : <SelectorMes anio={vista.anio} mes={vista.mes} onCambiar={(anio, mes) => setVista({ anio, mes })} />}
        <div className="ventas-top-derecha">
          <div className="ventas-buscar">
            <FaSearch />
            <input type="text" placeholder="Material, nombre o email..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          </div>
          <button className={`ventas-btn ${masOpciones ? "on" : ""}`} onClick={() => setMasOpciones(!masOpciones)}><FaSlidersH /> Más opciones</button>
        </div>
      </div>

      {masOpciones && (
        <div className="ventas-opciones">
          <label>Desde<input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
          <label>Hasta<input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
          {(desde || hasta) && <button className="ventas-btn" onClick={() => { setDesde(""); setHasta(""); }}>Volver al mes</button>}
          {!rangoLibre && <span>Elegí las dos fechas para ver un período a medida.</span>}
        </div>
      )}

      {cargando ? (
        <p className="ventas-vacio">Cargando ventas...</p>
      ) : (
        <>
          <div className="ventas-kpis">
            <div className="ventas-kpi destacado"><span>Vendiste</span><b>{formatoMoneda(resumen.total)}</b></div>
            <div className="ventas-kpi"><span>Ventas</span><b>{resumen.cantidad}</b></div>
            <div className="ventas-kpi"><span>Promedio por venta</span><b>{formatoMoneda(resumen.promedio)}</b></div>
          </div>

          <div className="ventas-dos">
            <div className="ventas-card">
              <b className="ventas-card-titulo">Lo más vendido</b>
              {ranking.length === 0 ? <p className="ventas-vacio">No hay ventas en este período.</p> : (
                <ol className="ventas-ranking">
                  {ranking.map((m, i) => (
                    <li key={m.nombre}>
                      <span className="ventas-ranking-num">{i + 1}</span>
                      <div className="ventas-ranking-info">
                        <div><strong>{m.nombre}</strong><b>{formatoMoneda(m.total)}</b></div>
                        <div className="ventas-ranking-barra"><i style={{ width: `${(m.total / maxRanking) * 100}%` }} /></div>
                        <small>{m.cantidad} venta{m.cantidad === 1 ? "" : "s"}</small>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div className="ventas-card">
              <b className="ventas-card-titulo">Ventas</b>
              {porDia.length === 0 && <p className="ventas-vacio">No hay ventas que coincidan.</p>}
              {porDia.map(([dia, lista]) => {
                const f = new Date(`${dia}T00:00:00`);
                return (
                  <div key={dia} className="ventas-dia">
                    <div className="ventas-dia-cab">
                      <span>{DIAS[f.getDay()]} {f.getDate()} de {MESES[f.getMonth()]}</span>
                      <span>{formatoMoneda(lista.reduce((a, c) => a + Number(c.precio_pagado || 0), 0))}</span>
                    </div>
                    {lista.map((c) => (
                      <div key={c.id} className="ventas-item">
                        <div className="ventas-item-info">
                          <strong>{c.nombre_material}</strong>
                          <small>
                            {c.usuario_id
                              ? <FaUserCheck className="ventas-icono-cuenta" title="Con cuenta" />
                              : <FaUserSlash className="ventas-icono-invitado" title="Invitado" />}
                            {c.nombre_usuario || "(sin nombre)"} · {c.email_usuario} · {new Date(c.fecha).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                          </small>
                        </div>
                        <b className="ventas-item-precio">{formatoMoneda(c.precio_pagado)}</b>
                        <button className="ventas-btn-eliminar" onClick={() => eliminarVenta(c)} disabled={eliminandoId === c.id} title="Eliminar esta venta" aria-label="Eliminar esta venta">
                          <FaTrash />
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
