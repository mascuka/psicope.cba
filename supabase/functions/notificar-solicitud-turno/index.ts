import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Todo lo de la solicitud lo escribe un visitante cualquiera desde Turnos:
// sin escapar, podía meter links o HTML armado en el mail que le llega a
// Brenda.
const escaparHtml = (texto: unknown) => String(texto ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

Deno.serve(async (req) => {
  // Preflight de CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { nombre, apellido, telefono, email, obra_social, motivo, sede_nombre } = await req.json();

    if (!nombre || !telefono || !email) {
      throw new Error("Faltan datos obligatorios (nombre, teléfono o email)");
    }

    // Cliente con permisos de administrador (server-side, nunca en el navegador)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Buscamos el email de TODOS los usuarios con rol admin
    const { data: admins, error: adminError } = await supabaseAdmin
      .from("usuarios")
      .select("email")
      .eq("rol", "admin");

    if (adminError) throw adminError;
    const destinatarios = (admins || []).map((a) => a.email).filter(Boolean);

    if (destinatarios.length === 0) {
      throw new Error("No hay ningún usuario con rol admin cargado en la tabla usuarios");
    }

    const html = `
      <h2>Nueva solicitud de turno</h2>
      <p><strong>Nombre:</strong> ${escaparHtml(nombre)} ${escaparHtml(apellido)}</p>
      <p><strong>Teléfono:</strong> ${escaparHtml(telefono)}</p>
      <p><strong>Email:</strong> ${escaparHtml(email)}</p>
      <p><strong>Obra social:</strong> ${escaparHtml(obra_social || "No indicó")}</p>
      <p><strong>Sede de preferencia:</strong> ${escaparHtml(sede_nombre || "No indicó")}</p>
      <p><strong>Motivo de la consulta:</strong><br/>${motivo ? escaparHtml(motivo).replace(/\n/g, "<br/>") : "No indicó"}</p>
      <hr/>
      <p style="font-size:13px;color:#888">Este mensaje se generó automáticamente desde la web.</p>
    `;

    const fromDireccion = Deno.env.get("RESEND_FROM") || "Turnos Psicope <onboarding@resend.dev>";

    // Mandamos un email POR CADA admin, no uno solo con todos los
    // destinatarios juntos. Así, mientras la cuenta de Resend no tenga
    // un dominio propio verificado, un destinatario no permitido (modo
    // de prueba) no le bloquea el mail a los demás.
    const resultados = await Promise.all(
      destinatarios.map(async (destinatario) => {
        const resp = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${Deno.env.get("RESEND_API_KEY")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: fromDireccion,
            to: [destinatario],
            subject: `Nueva solicitud de turno - ${nombre} ${apellido || ""}`,
            html,
          }),
        });

        if (resp.ok) return { destinatario, ok: true };
        const detalle = await resp.text();
        return { destinatario, ok: false, detalle };
      })
    );

    const enviados = resultados.filter((r) => r.ok);
    const fallidos = resultados.filter((r) => !r.ok);

    if (enviados.length === 0) {
      // Ninguno se pudo mandar: ahí sí es un error real a mostrar
      throw new Error(
        `No se pudo enviar a ningún admin. Detalle: ${JSON.stringify(fallidos)}`
      );
    }

    return new Response(JSON.stringify({ ok: true, enviados: enviados.length, fallidos }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});