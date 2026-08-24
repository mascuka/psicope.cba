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
    const { material_id, invitado } = await req.json();
    if (!material_id) throw new Error("Falta material_id");

    // Cliente con permisos de administrador (server-side, nunca en el navegador)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Quién compra: un usuario logueado (token de Supabase) O un invitado
    // sin cuenta (nombre/apellido/email mandados desde el modal de "Comprar
    // sin cuenta"). El pago aprobado en Mercado Pago es lo que confirma que
    // el email del invitado es real -- no hace falta que tenga cuenta.
    let payerEmail: string | undefined;
    let payerNombre: string | undefined;
    let payerApellido: string | undefined;

    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabaseAdmin.auth.getUser(token);
      if (user) payerEmail = user.email;
    }

    if (!payerEmail) {
      if (!invitado?.email || !invitado?.nombre || !invitado?.apellido) {
        throw new Error("Para comprar sin cuenta hacen falta nombre, apellido y email");
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invitado.email)) {
        throw new Error("El email no es válido");
      }
      payerEmail = invitado.email;
      payerNombre = invitado.nombre;
      payerApellido = invitado.apellido;
    }

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

    // Referencia propia (no el id del material) para poder identificar ESTA
    // compra puntual más adelante -- el id del material solo no alcanza,
    // porque dos personas distintas pueden comprar el mismo material.
    // CRUCIAL: si quien paga está logueado en una cuenta de Mercado Pago
    // con un email distinto al que puso acá, el pago que después llega al
    // webhook trae el email de ESA cuenta de MP, no el que escribió en
    // este formulario -- por eso guardamos el email correcto ACÁ, antes de
    // ir a pagar, en una fila "pendiente" que el webhook completa después
    // usando esta referencia (nunca el email que venga de Mercado Pago).
    const referenciaExterna = crypto.randomUUID();
    const { error: pendienteError } = await supabaseAdmin.from("compras").insert([{
      material_id: material.id,
      external_reference: referenciaExterna,
      payment_id: `PENDIENTE_${referenciaExterna}`,
      status: "pendiente",
      email_usuario: payerEmail,
      nombre_usuario: payerNombre ? `${payerNombre} ${payerApellido || ""}`.trim() : null,
      nombre_material: material.nombre,
      precio_pagado: precioFinal,
      fecha: new Date().toISOString(),
    }]);
    if (pendienteError) throw pendienteError;

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
      external_reference: referenciaExterna,
      payer: {
        email: payerEmail,
        ...(payerNombre ? { name: payerNombre, surname: payerApellido } : {}),
      },
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