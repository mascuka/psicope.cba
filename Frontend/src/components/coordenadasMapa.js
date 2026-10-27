// Coordenadas de un link largo de Google Maps: el pin exacto del lugar
// (!3d lat !4d lng) o, si no está, el centro de la vista (@lat,lng). Los
// links cortos (maps.app.goo.gl) no traen coordenadas: se expanden al
// guardar la sede con la edge function resolver-link-mapa.
export const coordenadasDeLinkGoogle = (link) => {
  if (!link) return null;
  const m = link.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/) || link.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  return m ? { lat: Number(m[1]), lon: Number(m[2]) } : null;
};

// Qué buscar en el mapa embebido de Google. En orden de preferencia:
// 1) el nombre del lugar del link largo (/maps/place/Sta+Fe+133,+X5000ABC+Córdoba/),
//    que es exactamente el lugar que eligió Brenda y muestra una ficha linda;
// 2) las coordenadas del link;
// 3) la dirección escrita, completada con la ciudad para que no caiga en otra
//    calle con el mismo nombre en otra provincia.
export const consultaMapaGoogle = (link, direccion) => {
  const lugar = link?.match(/\/maps\/place\/([^/]+)/)?.[1];
  if (lugar) return decodeURIComponent(lugar.replace(/\+/g, " "));
  const coords = coordenadasDeLinkGoogle(link);
  if (coords) return `${coords.lat},${coords.lon}`;
  return /c[oó]rdoba/i.test(direccion) ? direccion : `${direccion}, Córdoba, Argentina`;
};
