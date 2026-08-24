import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

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
    const { email, nombre, nombre_material, archivo_url, nombre_descarga } = await req.json();

    if (!email || !archivo_url) {
      throw new Error("Faltan datos obligatorios (email o archivo_url)");
    }

    // Cliente con permisos de administrador (server-side, nunca en el navegador)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // "archivo_url" puede venir como nombre de archivo suelto o como URL
    // completa (mismo criterio que descargarArchivoSeguro en el frontend).
    const fileName = archivo_url.includes("/") ? archivo_url.split("/").pop().split("?")[0] : archivo_url;
    const extension = fileName.includes(".") ? fileName.split(".").pop() : "pdf";
    const nombreLimpio = (nombre_descarga || nombre_material || "material")
      .trim()
      .replace(/[\\/:*?"<>|]/g, "")
      .slice(0, 100);
    const nombreArchivoFinal = `${nombreLimpio || "material"}.${extension}`;

    // A diferencia del botón "Descargar" del sitio (que dura 60 segundos
    // porque se usa al toque), este link va por mail y puede que lo abran
    // recién varios días después -- por eso dura 7 días.
    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from("materiales-privados")
      .createSignedUrl(fileName, 60 * 60 * 24 * 7, { download: nombreArchivoFinal });
    if (signError) throw signError;

    const html = `
      <h2>¡Gracias por tu compra!</h2>
      <p>Hola ${nombre || ""},</p>
      <p>Ya tenés disponible tu material: <strong>${nombre_material || "tu material"}</strong></p>
      <p style="margin:24px 0;">
        <a href="${signed.signedUrl}" style="background:#EFE3D8;color:#2B2530;padding:12px 26px;border-radius:30px;text-decoration:none;font-weight:bold;display:inline-block;">
          Descargar material
        </a>
      </p>
      <p style="font-size:13px;color:#888">Te recomendamos descargar el material ahora y guardarlo en tu dispositivo: este link es temporal y más adelante podría dejar de funcionar.</p>
      <hr/>
      <p style="font-size:13px;color:#888">Este mensaje se generó automáticamente desde la web.</p>
    `;

    // Se manda con el Gmail real de Brenda (vía SMTP + contraseña de
    // aplicación), no con Resend: Resend en modo de prueba (sin dominio
    // propio verificado) solo deja mandar correos a la casilla dueña de la
    // cuenta, no a clientes reales.
    const gmailUser = Deno.env.get("GMAIL_USER")!;
    const client = new SMTPClient({
      connection: {
        hostname: "smtp.gmail.com",
        port: 465,
        tls: true,
        auth: {
          username: gmailUser,
          password: Deno.env.get("GMAIL_APP_PASSWORD")!,
        },
      },
    });

    try {
      await client.send({
        from: `Psicope.cba <${gmailUser}>`,
        to: email,
        subject: `Tu material "${nombre_material || ""}" ya está listo`,
        content: "Tu cliente de correo no puede mostrar el mensaje en HTML.",
        html,
      });
    } finally {
      await client.close();
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
