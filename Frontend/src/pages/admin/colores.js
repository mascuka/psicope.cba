/* Colores del panel, compartidos por la Agenda y Pacientes (así cada
   paciente se ve del mismo color en el calendario y en su lista).
   Dos clases de cosas: las de un paciente van con el color de ese paciente;
   el resto es "Otro": dorado y con estrellita. c = punto/borde, f = fondo,
   t = texto. */
export const OTRO = { c: "#C9A227", f: "#FAF0CC", t: "#6E5300" };

// Un color por paciente, sacado de su id: siempre el mismo para el mismo
// paciente aunque se sumen otros. Se salta la franja de los amarillos
// (35°–70°), que queda para "Otro".
const coloresPaciente = {};
export function colorPaciente(id) {
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
