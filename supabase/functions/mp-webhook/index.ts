import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    const body = await req.json();

    // Mercado Pago manda distintos formatos según el evento. Nos interesa "payment".
    const paymentId = body?.data?.id || body?.id;
    const type = body?.type || body?.topic;

    if (type !== "payment" || !paymentId) {
      // No es una notificación de pago (puede ser un test de MP) -> respondemos OK igual
      return new Response("ok", { status: 200 });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // PASO CLAVE: le preguntamos a Mercado Pago (server a server) si ese pago
    // realmente existe y está aprobado. Nunca confiamos en lo que diga la notificación sola.
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${Deno.env.get("MP_ACCESS_TOKEN")}` },
    });
    const payment = await mpRes.json();

    if (!mpRes.ok) {
      console.error("No se pudo verificar el pago en MP:", payment);
      return new Response("ok", { status: 200 }); // igual respondemos 200 para que MP no reintente infinito
    }

    if (payment.status !== "approved") {
      return new Response("ok", { status: 200 });
    }

    const materialId = payment.external_reference;
    const payerEmail = payment.payer?.email;

    // Evitar duplicados si MP reenvía la misma notificación
    const { data: existente } = await supabaseAdmin
      .from("compras")
      .select("id")
      .eq("payment_id", String(paymentId))
      .maybeSingle();

    if (existente) {
      return new Response("ok", { status: 200 });
    }

    // Buscar el usuario por email para asociar la compra
    const { data: perfil } = await supabaseAdmin
      .from("usuarios")
      .select("id, nombre, email")
      .eq("email", payerEmail)
      .maybeSingle();

    const { data: material } = await supabaseAdmin
      .from("materiales")
      .select("nombre, precio, en_oferta, porcentaje_descuento")
      .eq("id", materialId)
      .single();

    const precioFinal = material?.en_oferta
      ? material.precio * (1 - material.porcentaje_descuento / 100)
      : material?.precio;

    const { error: insertError } = await supabaseAdmin.from("compras").insert([
      {
        usuario_id: perfil?.id || null,
        material_id: materialId,
        payment_id: String(paymentId),
        status: "approved",
        nombre_usuario: perfil?.nombre || "Usuario",
        email_usuario: payerEmail,
        nombre_material: material?.nombre,
        precio_pagado: precioFinal,
        fecha: new Date().toISOString(),
      },
    ]);

    if (insertError) console.error("Error insertando compra:", insertError);

    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error("Error en webhook:", error);
    return new Response("ok", { status: 200 });
  }
});