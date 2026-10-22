import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Los links de "Compartir" de Google Maps (maps.app.goo.gl/...) son cortos y
// no traen coordenadas: hay que seguir las redirecciones hasta el link largo
// (google.com/maps/place/...!3d-31.41!4d-64.18). Desde el navegador no se
// puede porque Google no habilita CORS, por eso se hace acá. Se usa al
// guardar una sede (Turnos.jsx), y el link largo es el que queda guardado.
const tieneCoordenadas = (url: string) =>
  /!3d-?\d+(\.\d+)?!4d-?\d+(\.\d+)?/.test(url) || /@-?\d+(\.\d+)?,-?\d+(\.\d+)?/.test(url);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Solo el admin edita sedes; evita que esto quede como un proxy abierto.
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) throw new Error("No autenticado");
    const { data: perfil } = await supabaseAdmin.from("usuarios").select("rol").eq("id", user.id).single();
    if (perfil?.rol !== "admin") throw new Error("Solo un administrador puede editar sedes");

    const { url } = await req.json();
    const host = new URL(url).hostname;
    if (!/(^|\.)(goo\.gl|google\.[a-z.]+)$/.test(host)) throw new Error("No es un link de Google Maps");

    // Redirecciones a mano (en vez de redirect: "follow") para poder mirar
    // cada Location: a veces Google termina en la página de consentimiento
    // de cookies, pero el link con coordenadas pasa antes por el camino.
    let actual = url;
    for (let i = 0; i < 6 && !tieneCoordenadas(actual); i++) {
      const resp = await fetch(actual, { redirect: "manual", headers: { "User-Agent": "Mozilla/5.0" } });
      const location = resp.headers.get("location");
      if (!location) break;
      const siguiente = new URL(location, actual);
      // consent.google.com/...?continue=<link real>
      actual = siguiente.hostname.startsWith("consent.")
        ? siguiente.searchParams.get("continue") || siguiente.toString()
        : siguiente.toString();
    }

    return new Response(JSON.stringify({ url: actual }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
