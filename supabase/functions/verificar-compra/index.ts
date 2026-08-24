import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Reemplaza la consulta directa que el navegador hacía antes contra la
// tabla "compras" para el polling de confirmación (ver
// esperarConfirmacionYDescargar en useComprarMaterial.js). Esa consulta
// directa exigía que la tabla estuviera abierta a cualquiera con la clave
// pública -- exactamente el problema que se cerró activando RLS (ver
// migración 20260824000512). Esta función usa la clave de service_role
// para hacer la MISMA búsqueda puntual, pero solo devuelve lo mínimo
// necesario (si hay una compra aprobada de ESE material para ESE email, y
// el payment_id para poder pedir la descarga) -- nunca el resto de la
// tabla.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { material_id, email, desde, payment_id } = await req.json();

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Dos formas de buscar: por payment_id (lo usa Success.jsx, la
    // pestaña que a veces abre Mercado Pago con su propio auto_return) o
    // por material_id + email + fecha (lo usa el polling normal del
    // sitio, ver esperarConfirmacionYDescargar).
    let query = supabaseAdmin.from("compras").select("payment_id, nombre_material").eq("status", "approved");
    if (payment_id) {
      query = query.eq("payment_id", payment_id);
    } else {
      if (!material_id || !email || !desde) throw new Error("Faltan datos");
      query = query.eq("material_id", material_id).eq("email_usuario", email).gte("fecha", desde);
    }
    const { data: compra } = await query.order("fecha", { ascending: false }).limit(1).maybeSingle();

    return new Response(JSON.stringify({ compra: compra || null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
