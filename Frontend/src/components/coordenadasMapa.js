// Coordenadas de un link largo de Google Maps: el pin exacto del lugar
// (!3d lat !4d lng) o, si no está, el centro de la vista (@lat,lng). Los
// links cortos (maps.app.goo.gl) no traen coordenadas: se expanden al
// guardar la sede con la edge function resolver-link-mapa.
export const coordenadasDeLinkGoogle = (link) => {
  if (!link) return null;
  const m = link.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/) || link.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  return m ? { lat: Number(m[1]), lon: Number(m[2]) } : null;
};
