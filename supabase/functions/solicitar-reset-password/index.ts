import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enviarMailGmail } from "../_shared/gmail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// El "Olvidaste tu contraseña" del sitio, mandado con el Gmail real de
// Brenda (mismo remitente que el resto de los mails del sitio -- ver
// notificar-compra-material) en vez del mail de recuperación de Supabase,
// que llegaba con remitente "supabase.io" y no se veía profesional.
//
// `admin.generateLink` arma el link de recuperación real (mismo mecanismo
// que usaría el mail automático de Supabase) SIN mandar ningún correo --
// el mail lo mandamos nosotros acá, con nuestro propio diseño.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { email } = await req.json();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Ingresá un correo válido");
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Solo a la web propia (o localhost al desarrollar): el Origin lo puede
    // inventar cualquiera que llame a la función a mano, y el link de
    // recuperación lleva la sesión de la cuenta -- no puede volver a otro sitio.
    const ORIGENES_PERMITIDOS = ["https://psicope-cba.com.ar", "http://localhost:5173", "http://127.0.0.1:5173"];
    const origenPedido = req.headers.get("origin") || "";
    const origin = ORIGENES_PERMITIDOS.includes(origenPedido) ? origenPedido : ORIGENES_PERMITIDOS[0];
    const redirectTo = `${origin}/restablecer-contrasena`;

    // Si el correo no está registrado, generateLink tira error -- no lo
    // dejamos llegar al cliente (misma lógica que ya tenía el frontend
    // para no confirmar/negar si un correo existe: siempre se responde
    // "ok", solo que acá además no se llega a mandar ningún mail).
    try {
      const { data, error } = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo },
      });
      if (error) throw error;

      const link = data.properties?.action_link;
      if (link) {
        const html = `
          <h2>Recuperá tu contraseña</h2>
          <p>Recibimos un pedido para restablecer la contraseña de tu cuenta en Psicope.cba.</p>
          <p style="margin:24px 0;">
            <a href="${link}" style="background:#EFE3D8;color:#2B2530;padding:12px 26px;border-radius:30px;text-decoration:none;font-weight:bold;display:inline-block;">
              Elegir nueva contraseña
            </a>
          </p>
          <p style="font-size:13px;color:#888">Si no pediste esto, podés ignorar este mensaje tranquilamente -- tu contraseña actual sigue funcionando igual.</p>
          <hr/>
          <p style="font-size:13px;color:#888">Este mensaje se generó automáticamente desde la web.</p>
        `;

        // La hora al final del asunto rompe el agrupado en un solo hilo
        // que hace Gmail (y otros webmails) cuando el asunto es IDÉNTICO
        // entre pedidos -- si alguien pide "olvidé mi contraseña" dos
        // veces seguidas, antes el segundo mail quedaba escondido abajo
        // del primero en el mismo hilo, mostrando la hora del primero y
        // dando la sensación de que el link "ya estaba viejo".
        // OJO: armada a mano (no con Intl.DateTimeFormat) a propósito --
        // esa devuelve "02:28 p. m." con espacios angostos Unicode
        // invisibles (típico del formato en español) que rompieron la
        // codificación del asunto del mail (RFC 2047) y de paso el
        // mensaje entero, mostrando código MIME crudo en vez del correo.
        // Argentina no tiene horario de verano desde 2009, así que el
        // offset fijo -3 siempre es correcto.
        const horaArg = new Date(Date.now() - 3 * 60 * 60 * 1000);
        const horaPedido = `${String(horaArg.getUTCHours()).padStart(2, "0")}:${String(horaArg.getUTCMinutes()).padStart(2, "0")}`;

        await enviarMailGmail({
          para: email,
          asunto: `Recuperá tu contraseña - Psicope.cba (${horaPedido})`,
          html,
        });
      }
    } catch (err) {
      // Correo no registrado u otro fallo puntual del envío -- se traga
      // acá adentro a propósito, la respuesta de afuera es siempre la
      // misma pase lo que pase.
      console.error("No se pudo generar/enviar el link de recuperación:", err);
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
