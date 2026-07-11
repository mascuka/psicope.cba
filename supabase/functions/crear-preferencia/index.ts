import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Preflight de CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { material_id } = await req.json();
    if (!material_id) throw new Error("Falta material_id");

    // Cliente con permisos de administrador (server-side, nunca en el navegador)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verificamos quién es el usuario a partir del token que manda el frontend
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    if (userError || !user) throw new Error("Usuario no autenticado");

    // Traemos el precio REAL desde la base, nunca confiamos en lo que mande el navegador
    const { data: material, error: matError } = await supabaseAdmin
      .from("materiales")
      .select("id, nombre, precio, en_oferta, porcentaje_descuento")
      .eq("id", material_id)
      .single();
    if (matError || !material) throw new Error("Material no encontrado");

    const precioFinal = material.en_oferta
      ? material.precio * (1 - material.porcentaje_descuento / 100)
      : material.precio;

    const origin = req.headers.get("origin") || "https://TU-DOMINIO.com";
    const esLocal = origin.includes("localhost") || origin.includes("127.0.0.1");

    const body = {
      items: [
        {
          id: String(material.id),
          title: material.nombre,
          unit_price: Number(parseFloat(precioFinal.toFixed(2))),
          quantity: 1,
          currency_id: "ARS",
        },
      ],
      back_urls: {
        success: `${origin}/success`,
        failure: `${origin}/materiales`,
        pending: `${origin}/materiales`,
      },
      external_reference: String(material.id),
      payer: { email: user.email },
      binary_mode: true,
    };

    // CRUCIAL: Mercado Pago rechaza auto_return si el back_url no es una URL
    // pública válida (localhost no cuenta). Solo lo agregamos si NO es local.
    if (!esLocal) {
      body.auto_return = "approved";
    }

    const mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("MP_ACCESS_TOKEN")}`,
      },
      body: JSON.stringify(body),
    });

    const data = await mpResponse.json();
    if (!mpResponse.ok) throw new Error(data.message || "Error al crear preferencia en MP");

    return new Response(JSON.stringify({ init_point: data.init_point }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});