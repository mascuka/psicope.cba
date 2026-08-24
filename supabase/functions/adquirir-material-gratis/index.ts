import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Acredita un material GRATUITO a un invitado sin cuenta (nombre, apellido,
// email) -- para un usuario logueado ya existe el mismo resultado del lado
// del cliente (registrarCompraDirecta en useComprarMaterial.js), que
// funciona porque RLS le deja insertar una compra propia (auth.uid() =
// usuario_id). Un invitado no tiene auth.uid(), así que ese camino directo
// no sirve acá -- hace falta una función de servidor, con la clave de
// service_role, que primero VERIFIQUE que el material realmente cuesta $0
// (nunca confiar en el precio que mande el navegador).
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { material_id, invitado } = await req.json();
    if (!material_id) throw new Error("Falta material_id");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Igual que crear-preferencia: usuario logueado (si mandó su sesión) o
    // invitado con nombre/apellido/email.
    let usuarioId: string | null = null;
    let payerEmail: string | undefined;
    let payerNombre: string | undefined;
    let payerApellido: string | undefined;

    const authHeader = req.headers.get("Authorization");
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabaseAdmin.auth.getUser(token);
      if (user) {
        usuarioId = user.id;
        payerEmail = user.email;
      }
    }
    if (!payerEmail) {
      if (!invitado?.email || !invitado?.nombre || !invitado?.apellido) {
        throw new Error("Para adquirir sin cuenta hacen falta nombre, apellido y email");
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invitado.email)) {
        throw new Error("El email no es válido");
      }
      payerEmail = invitado.email;
      payerNombre = invitado.nombre;
      payerApellido = invitado.apellido;
    }

    const { data: material, error: matError } = await supabaseAdmin
      .from("materiales")
      .select("id, nombre, precio, archivo_url, nombre_descarga")
      .eq("id", material_id)
      .single();
    if (matError || !material) throw new Error("Material no encontrado");
    if (Number(material.precio) !== 0) throw new Error("Este material no es gratuito");

    const paymentId = `GRATIS_${crypto.randomUUID()}`;
    const { error: insertError } = await supabaseAdmin.from("compras").insert([{
      usuario_id: usuarioId,
      material_id: material.id,
      nombre_usuario: usuarioId ? null : `${payerNombre} ${payerApellido || ""}`.trim(),
      email_usuario: payerEmail,
      nombre_material: material.nombre,
      precio_pagado: 0,
      status: "approved",
      payment_id: paymentId,
      fecha: new Date().toISOString(),
    }]);
    if (insertError) throw insertError;

    // El mail es un extra: si falla no debe romper la acreditación, que ya
    // quedó guardada arriba (mismo criterio que mp-webhook).
    let emailEnviado = false;
    let emailError: string | null = null;
    try {
      const { data: mailData, error: mailErr } = await supabaseAdmin.functions.invoke("notificar-compra-material", {
        body: {
          email: payerEmail,
          nombre: payerNombre,
          nombre_material: material.nombre,
          archivo_url: material.archivo_url,
          nombre_descarga: material.nombre_descarga,
        },
      });
      emailEnviado = !mailErr && !!mailData?.ok;
      if (!emailEnviado) emailError = mailErr?.message || mailData?.error || "Fallo desconocido";
    } catch (err) {
      emailError = err.message;
    }
    await supabaseAdmin.from("compras").update({ email_enviado: emailEnviado, email_error: emailError }).eq("payment_id", paymentId);

    return new Response(JSON.stringify({ ok: true, payment_id: paymentId }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
