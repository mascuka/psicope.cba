import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enviarMailGmail } from "../_shared/gmail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// El nombre lo escribe el comprador invitado: que no meta HTML en el mail.
const escaparHtml = (texto: unknown) => String(texto ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

Deno.serve(async (req) => {
  // Preflight de CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const noAutorizado = (status: number) => new Response(JSON.stringify({ error: "No autorizado" }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

  try {
    const body = await req.json();
    let { email, nombre, nombre_material, archivo_url, nombre_descarga } = body;

    // Cliente con permisos de administrador (server-side, nunca en el navegador)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Antes cualquiera (sin sesión) podía pedir el link firmado de cualquier
    // PDF pago (los archivo_url se leen públicos en "materiales") y que le
    // llegara por mail. Ahora hay dos formas de llamarla:
    // - mp-webhook y adquirir-material-gratis, con la clave de service_role,
    //   DESPUÉS de verificar el pago: se confía en los datos que mandan.
    // - El navegador, con la sesión del usuario (material gratis logueado y
    //   "Reenviar por correo" de Mis Compras): solo manda material_id, y el
    //   resto sale de la base. El mail va siempre a la cuenta de la sesión,
    //   y solo si ya tiene ese material acreditado.
    const authHeader = req.headers.get("Authorization") || "";
    if (authHeader !== `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`) {
      const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.replace("Bearer ", ""));
      if (!user?.email) return noAutorizado(401);

      const { data: compra } = await supabaseAdmin
        .from("compras")
        .select("materiales ( nombre, archivo_url, nombre_descarga )")
        .eq("usuario_id", user.id)
        .eq("material_id", body.material_id)
        .eq("status", "approved")
        .limit(1)
        .maybeSingle();
      // Por la relación compras -> materiales llega un objeto, pero los tipos
      // de supabase-js lo declaran como lista: se aceptan las dos formas.
      const material = Array.isArray(compra?.materiales) ? compra.materiales[0] : compra?.materiales;
      if (!material) return noAutorizado(403);

      const { data: perfil } = await supabaseAdmin.from("usuarios").select("nombre").eq("id", user.id).maybeSingle();
      email = user.email;
      nombre = perfil?.nombre;
      ({ nombre: nombre_material, archivo_url, nombre_descarga } = material);
    }

    if (!email || !archivo_url) {
      throw new Error("Faltan datos obligatorios (email o archivo_url)");
    }

    // "archivo_url" puede venir como nombre de archivo suelto o como URL
    // completa (mismo criterio que descargarArchivoSeguro en el frontend).
    const fileName = archivo_url.includes("/") ? archivo_url.split("/").pop().split("?")[0] : archivo_url;
    const extension = fileName.includes(".") ? fileName.split(".").pop() : "pdf";
    // Se había sacado la ñ/tildes acá pensando que el visor de PDF de
    // Gmail no las manejaba bien, pero "años" -> "anos" queda mal (cambia
    // el significado). En realidad esa corrupción del nombre venía de
    // OTRO bug ya arreglado (el asunto del mail con caracteres raros de
    // Intl.DateTimeFormat rompía el correo entero, MIME incluido) -- con
    // ese arreglado, la ñ/tildes no hace falta sacarlas: mismo criterio
    // que el botón "Descargar" de la web, que siempre las dejó bien.
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
      .createSignedUrl(fileName, 60 * 60 * 24 * 7);
    if (signError) throw signError;
    // El nombre de descarga se agrega a mano: la versión actual de
    // supabase-js lo codifica dos veces (URLSearchParams y después
    // encodeURI), y el archivo bajaba como "Estimulaci%C3%B3n cognitiva.pdf".
    const linkDescarga = `${signed.signedUrl}&download=${encodeURIComponent(nombreArchivoFinal)}`;

    const html = `
      <h2>¡Gracias por tu compra!</h2>
      <p>Hola ${escaparHtml(nombre)},</p>
      <p>Ya tenés disponible tu material: <strong>${escaparHtml(nombre_material || "tu material")}</strong></p>
      <p style="margin:24px 0;">
        <a href="${linkDescarga}" style="background:#EFE3D8;color:#2B2530;padding:12px 26px;border-radius:30px;text-decoration:none;font-weight:bold;display:inline-block;">
          Descargar material
        </a>
      </p>
      <p style="font-size:13px;color:#888">Te recomendamos descargar el material ahora y guardarlo en tu dispositivo: este link es temporal y más adelante podría dejar de funcionar.</p>
      <hr/>
      <p style="font-size:13px;color:#888">Este mensaje se generó automáticamente desde la web.</p>
    `;

    // La hora al final del asunto rompe el agrupado en un solo hilo que
    // hace Gmail (y otros webmails) cuando el asunto es IDÉNTICO -- si el
    // mismo comprador se lleva el mismo material dos veces (o lo compra
    // de nuevo más adelante), antes el mail nuevo quedaba escondido abajo
    // del viejo en el mismo hilo, dando la sensación de que no había
    // llegado nada nuevo.
    // OJO: armada a mano (no con Intl.DateTimeFormat) a propósito -- esa
    // devuelve "02:28 p. m." con espacios angostos Unicode invisibles
    // (típico del formato en español) que rompieron la codificación del
    // asunto del mail (RFC 2047) y de paso el mensaje entero, mostrando
    // código MIME crudo en vez del correo. Argentina no tiene horario de
    // verano desde 2009, así que el offset fijo -3 siempre es correcto.
    const horaArg = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const horaCompra = `${String(horaArg.getUTCHours()).padStart(2, "0")}:${String(horaArg.getUTCMinutes()).padStart(2, "0")}`;

    // Se manda con el Gmail real de Brenda (vía SMTP + contraseña de
    // aplicación), no con Resend: Resend en modo de prueba (sin dominio
    // propio verificado) solo deja mandar correos a la casilla dueña de la
    // cuenta, no a clientes reales.
    await enviarMailGmail({
      para: email,
      asunto: `Tu material "${nombre_material || ""}" ya está listo (${horaCompra})`,
      html,
    });

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
