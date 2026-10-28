import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { enviarMailGmail } from "../_shared/gmail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// El nombre lo escribe quien se registra: que no meta HTML en el mail.
const escaparHtml = (texto: unknown) => String(texto ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Registro de una cuenta nueva. Antes el navegador llamaba a
// supabase.auth.signUp, que manda su propio mail de confirmación (remitente
// supabase.io, en inglés). Acá `admin.generateLink` crea la cuenta y arma el
// link de confirmación SIN mandar nada, y el mail sale con el Gmail de
// Brenda y nuestro diseño (mismo criterio que solicitar-reset-password).
// El perfil en "usuarios" lo crea la base sola con los datos de `data`
// (trigger crear_perfil_usuario).
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const responder = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

  try {
    const { nombre, email, password, fecha_nacimiento, pais, telefono } = await req.json();

    if (!nombre?.trim() || !email || !password || !fecha_nacimiento || !pais) {
      return responder({ error: "Completá todos los campos obligatorios" }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return responder({ error: "Ingresá un correo válido" }, 400);
    }
    if (String(password).length < 6) {
      return responder({ error: "La contraseña tiene que tener al menos 6 caracteres" }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Solo a la web propia (o localhost al desarrollar): el Origin lo puede
    // inventar cualquiera, y el link de confirmación abre la sesión.
    const ORIGENES_PERMITIDOS = ["https://psicope-cba.com.ar", "http://localhost:5173", "http://127.0.0.1:5173"];
    const origenPedido = req.headers.get("origin") || "";
    const origin = ORIGENES_PERMITIDOS.includes(origenPedido) ? origenPedido : ORIGENES_PERMITIDOS[0];

    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "signup",
      email: email.trim(),
      password,
      options: {
        data: { nombre: nombre.trim(), fecha_nacimiento, pais, telefono: telefono || null },
        redirectTo: `${origin}/`,
      },
    });
    if (error) {
      if (/already|registered|exists/i.test(error.message)) {
        return responder({ error: "Este correo ya tiene una cuenta. Probá iniciar sesión o recuperar la contraseña." }, 400);
      }
      if (/password/i.test(error.message)) {
        return responder({ error: "La contraseña es muy débil: probá con una más larga." }, 400);
      }
      throw error;
    }

    const link = data.properties?.action_link;
    const html = `
      <h2>¡Hola ${escaparHtml(nombre.trim())}! Te damos la bienvenida</h2>
      <p>Gracias por crear tu cuenta en Psicope.cba, el espacio de la Lic. Brenda Grossi.</p>
      <p>Para activarla, solo falta que confirmes tu correo:</p>
      <p style="margin:24px 0;">
        <a href="${link}" style="background:#EFE3D8;color:#2B2530;padding:12px 26px;border-radius:30px;text-decoration:none;font-weight:bold;display:inline-block;">
          Confirmar mi cuenta
        </a>
      </p>
      <p>Con tu cuenta vas a tener tus materiales siempre a mano en "Mis Compras", para descargarlos cuando quieras.</p>
      <p style="font-size:13px;color:#888">Si no creaste esta cuenta, podés ignorar este mensaje tranquilamente.</p>
      <hr/>
      <p style="font-size:13px;color:#888">Este mensaje se generó automáticamente desde la web.</p>
    `;

    // Hora en el asunto: si alguien se registra de nuevo (por ejemplo,
    // después de borrar la cuenta), Gmail no esconde el mail nuevo en el
    // hilo del viejo. Armada a mano, ver notificar-compra-material.
    const horaArg = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const hora = `${String(horaArg.getUTCHours()).padStart(2, "0")}:${String(horaArg.getUTCMinutes()).padStart(2, "0")}`;

    try {
      await enviarMailGmail({ para: email.trim(), asunto: `Confirmá tu cuenta en Psicope.cba (${hora})`, html });
    } catch (err) {
      // Sin el mail no hay forma de confirmar: se borra la cuenta recién
      // creada para que pueda volver a intentar con el mismo correo.
      console.error("No se pudo mandar el mail de confirmación:", err);
      await supabaseAdmin.auth.admin.deleteUser(data.user.id);
      return responder({ error: "No pudimos mandarte el mail de confirmación. Probá de nuevo en unos minutos." }, 500);
    }

    return responder({ ok: true });
  } catch (err) {
    console.error("registrar-usuario:", err);
    return responder({ error: "No se pudo crear la cuenta. Probá de nuevo en unos minutos." }, 500);
  }
});
