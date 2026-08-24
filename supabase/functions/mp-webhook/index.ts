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

    // Evitar duplicados si MP reenvía la misma notificación.
    const { data: existente } = await supabaseAdmin
      .from("compras")
      .select("id")
      .eq("payment_id", String(paymentId))
      .maybeSingle();

    if (existente) {
      return new Response("ok", { status: 200 });
    }

    // La fila "pendiente" se creó ANTES de ir a pagar (ver crear-preferencia)
    // con el email que el comprador puso en el formulario -- es la fuente de
    // verdad de a quién hay que mandarle el material. NUNCA usamos
    // payment.payer.email para esto: si el comprador está logueado en una
    // cuenta de Mercado Pago con otro email (ej: paga con su MP personal
    // pero puso el mail de un regalo), MP informa el email de ESA cuenta,
    // no el que puso acá -- y el material terminaba yéndole a la persona
    // equivocada.
    const { data: pendiente } = await supabaseAdmin
      .from("compras")
      .select("id, material_id, email_usuario, nombre_usuario")
      .eq("external_reference", payment.external_reference)
      .eq("status", "pendiente")
      .maybeSingle();

    // Si compró como invitado (sin cuenta), no hay fila en "usuarios" -- el
    // nombre que cargó en el modal de compra sigue disponible acá porque se
    // lo mandamos a MP como payer.name/surname al crear la preferencia.
    const nombreInvitado = payment.payer?.first_name
      ? `${payment.payer.first_name} ${payment.payer.last_name || ""}`.trim()
      : null;

    // Fallback para pagos viejos (de antes de que existiera la fila
    // pendiente) donde external_reference era directo el id del material.
    const materialId = pendiente?.material_id || payment.external_reference;
    const payerEmail = pendiente?.email_usuario || payment.payer?.email;
    const nombreComprador = pendiente?.nombre_usuario || nombreInvitado;

    // Buscar el usuario por email para asociar la compra
    const { data: perfil } = await supabaseAdmin
      .from("usuarios")
      .select("id, nombre, email")
      .eq("email", payerEmail)
      .maybeSingle();

    const { data: material } = await supabaseAdmin
      .from("materiales")
      .select("nombre, precio, en_oferta, porcentaje_descuento, archivo_url, nombre_descarga")
      .eq("id", materialId)
      .single();

    const precioFinal = material?.en_oferta
      ? material.precio * (1 - material.porcentaje_descuento / 100)
      : material?.precio;

    // Un Pack tiene su propio archivo (un .zip armado del lado del admin al
    // crearlo), así que se acredita igual que cualquier otro material.
    const datosCompra = {
      usuario_id: perfil?.id || null,
      material_id: materialId,
      payment_id: String(paymentId),
      status: "approved",
      nombre_usuario: perfil?.nombre || nombreComprador || "Usuario",
      email_usuario: payerEmail,
      nombre_material: material?.nombre,
      precio_pagado: precioFinal,
      fecha: new Date().toISOString(),
    };

    const { data: compraInsertada, error: insertError } = pendiente
      ? await supabaseAdmin.from("compras").update(datosCompra).eq("id", pendiente.id).select("id").single()
      : await supabaseAdmin.from("compras").insert([datosCompra]).select("id").single();

    if (insertError) {
      console.error("Error guardando compra:", insertError);
    } else {
      // El mail es un "nice to have" para la ACREDITACIÓN (que ya quedó
      // guardada arriba, así que no reintentamos el webhook por esto) --
      // pero antes el resultado se perdía en un console.error que nadie
      // veía. Ahora se guarda en la propia fila de "compras" (email_enviado
      // / email_error) para poder diagnosticar sin depender de logs.
      let emailEnviado = false;
      let emailError: string | null = null;
      try {
        const mailResp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/notificar-compra-material`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            email: payerEmail,
            nombre: perfil?.nombre || nombreComprador,
            nombre_material: material?.nombre,
            archivo_url: material?.archivo_url,
            nombre_descarga: material?.nombre_descarga,
          }),
        });
        const mailData = await mailResp.json().catch(() => ({}));
        if (mailResp.ok && mailData?.ok) {
          emailEnviado = true;
        } else {
          emailError = mailData?.error || `HTTP ${mailResp.status}`;
          console.error("notificar-compra-material devolvió error:", emailError);
        }
      } catch (mailErr) {
        emailError = mailErr.message || String(mailErr);
        console.error("No se pudo enviar el email de compra:", mailErr);
      }

      if (compraInsertada?.id) {
        await supabaseAdmin
          .from("compras")
          .update({ email_enviado: emailEnviado, email_error: emailError })
          .eq("id", compraInsertada.id);
      }

      // Si esta compra vino del QR compartido, liberamos la reserva apenas
      // se confirma el pago -- así el siguiente en la fila no tiene que
      // esperar los 2 minutos completos. Si vino de Checkout Pro (no del
      // QR), este UPDATE simplemente no encuentra ninguna fila que coincida
      // y no hace nada.
      if (payment.external_reference) {
        await supabaseAdmin
          .from("qr_reserva")
          .update({ ocupado: false })
          .eq("id", 1)
          .eq("titular", payment.external_reference);
      }
    }

    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error("Error en webhook:", error);
    return new Response("ok", { status: 200 });
  }
});