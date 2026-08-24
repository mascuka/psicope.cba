import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Búsquedas pedidas puntualmente por la clienta (Brenda) para el material
// de un consultorio de psicopedagogía: letras/números móviles, cuadernos,
// chicos escribiendo, chicos jugando juegos de mesa -- el material real
// que se usa en una sesión, no un escritorio de oficina genérico. Para el
// estilo "foto real" del asistente (ver AsistenteIA.jsx -> estiloFotoReal).
// En inglés porque Pexels indexa mucho mejor en ese idioma, aunque la
// cuenta sea en español -- no afecta el idioma del texto, que sigue
// viniendo de Gemini.
const BUSQUEDAS = [
  "wooden letter tiles",
  "colorful alphabet letters",
  "magnetic letters colorful",
  "number tiles colorful",
  "school notebook",
  "notebook pencil case",
  "child writing homework",
  "kid writing notebook",
  "children playing board game",
  "kids board game table",
  "child doing puzzle",
  "children learning classroom",
  "kid reading book",
  "child with flashcards",
  "kids crafts table",
  "child drawing coloring",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Mismo criterio que generar-post-ia: solo un administrador puede usar
    // el asistente (y por lo tanto, gastar cupo de la API de Pexels).
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) throw new Error("No autenticado");
    const { data: perfil } = await supabaseAdmin.from("usuarios").select("rol").eq("id", user.id).single();
    if (perfil?.rol !== "admin") throw new Error("Solo un administrador puede usar el asistente");

    // Búsqueda + página al azar -- así entre dos pedidos seguidos (dos
    // tarjetas de la misma tanda, o "cambiar fondo" en la misma sesión)
    // rara vez cae la misma foto, sin necesidad de guardar un historial
    // en la base para esto.
    const busqueda = BUSQUEDAS[Math.floor(Math.random() * BUSQUEDAS.length)];
    const pagina = 1 + Math.floor(Math.random() * 5);
    const resp = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(busqueda)}&per_page=15&page=${pagina}&orientation=portrait`,
      { headers: { Authorization: Deno.env.get("PEXELS_API_KEY")! } }
    );
    if (!resp.ok) throw new Error(`Pexels respondió ${resp.status}: ${await resp.text()}`);
    const data = await resp.json();
    const fotos = data?.photos || [];
    if (!fotos.length) throw new Error(`Pexels no devolvió fotos para "${busqueda}"`);
    const elegida = fotos[Math.floor(Math.random() * fotos.length)];

    return new Response(JSON.stringify({
      url: elegida.src?.large2x || elegida.src?.large,
      fotografo: elegida.photographer,
      fotografo_url: elegida.photographer_url,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
