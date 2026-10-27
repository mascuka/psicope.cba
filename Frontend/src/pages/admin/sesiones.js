// Cuentas de las sesiones de los turnos fijos, compartidas por la Agenda y
// Finanzas: qué días hubo sesión, cuánto se cobra cada una y cuándo.
//
// - Un turno fijo (horarios_pacientes) se repite cada semana en su día, entre
//   fecha_desde y fecha_hasta.
// - horarios_excepciones marca un día puntual: "cancelado" (ese día no hubo
//   sesión) o "falto" (faltó; `cobra` dice si igual se cobra).
// - Forma de cobro del turno: "efectivo" (su monto, el mismo día) u
//   "obra_social" (lo que abona esa obra social, a sus dias_pago días). Los
//   turnos viejos sin forma elegida toman la del paciente.

export const claveDia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const deClave = (k) => { const [a, m, d] = k.split("-").map(Number); return new Date(a, m - 1, d); };
export const masDias = (k, n) => { const f = deClave(k); f.setDate(f.getDate() + n); return claveDia(f); };

// La excepción de un turno en un día, si hay: { estado, cobra, id }.
export const indiceExcepciones = (excepciones) => {
  const idx = {};
  (excepciones || []).forEach((e) => { idx[`${e.horario_id}|${e.fecha}`] = e; });
  return idx;
};

// Cómo se cobra un turno: { forma, monto, diasPago, obraSocial }.
export function cobroDeTurno(h, obrasSociales) {
  const os = (id) => obrasSociales.find((o) => o.id === id);
  if (h.forma_cobro === "obra_social" && h.obra_social_id) {
    const o = os(h.obra_social_id);
    return { forma: "obra_social", monto: Number(o?.precio_hora || 0), diasPago: Number(o?.dias_pago || 30), obraSocial: o };
  }
  if (h.forma_cobro === "efectivo") return { forma: "efectivo", monto: Number(h.monto || 0), diasPago: 0, obraSocial: null };
  // Turno viejo: lo del paciente.
  const p = h.pacientes || {};
  if (p.obra_social_id) {
    const o = os(p.obra_social_id);
    return { forma: "obra_social", monto: Number(o?.precio_hora || 0), diasPago: Number(o?.dias_pago || 30), obraSocial: o };
  }
  return { forma: "efectivo", monto: Number(p.monto_personalizado || 0), diasPago: Number(p.dias_pago_personalizado || 0), obraSocial: null };
}

// Todas las sesiones entre dos fechas (inclusive), sin las canceladas:
// [{ horario, fecha, falto, cobra, monto, forma, obraSocial, fechaCobro }].
// Una sesión a la que faltó y no se cobra queda con monto 0.
export function sesionesEntre(horarios, excepciones, obrasSociales, desde, hasta) {
  const idx = indiceExcepciones(excepciones);
  const salida = [];
  for (const h of horarios) {
    let k = h.fecha_desde > desde ? h.fecha_desde : desde;
    const fin = h.fecha_hasta && h.fecha_hasta < hasta ? h.fecha_hasta : hasta;
    // Avanza hasta el primer día de la semana que le toca.
    const salto = (h.dia_semana - deClave(k).getDay() + 7) % 7;
    k = masDias(k, salto);
    const cobro = cobroDeTurno(h, obrasSociales);
    for (; k <= fin; k = masDias(k, 7)) {
      const ex = idx[`${h.id}|${k}`];
      if (ex?.estado === "cancelado") continue;
      const falto = ex?.estado === "falto";
      const cobra = !falto || ex.cobra;
      salida.push({
        horario: h, fecha: k, falto, cobra,
        monto: cobra ? cobro.monto : 0,
        forma: cobro.forma, obraSocial: cobro.obraSocial,
        fechaCobro: masDias(k, cobro.diasPago),
      });
    }
  }
  return salida;
}
