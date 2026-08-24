import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// El QR de cobro es UN solo punto de venta en Mercado Pago (no se puede
// generar uno nuevo, aislado, por cada visitante) -- estos datos identifican
// ESE punto de venta puntual, creado a mano una sola vez para "Psicope Web".
// Cuelga de una TIENDA propia (id 80380127), separada de la tienda vieja
// que ya tenía la cuenta (de un emprendimiento anterior) -- así el nombre y
// los datos que ve quien paga son 100% de Psicope, sin relación con nada
// viejo. No son secretos (son, de hecho, parte del propio código QR
// público), así que van acá fijos en vez de en variables de entorno.
const MP_USER_ID = "146599178";
const MP_EXTERNAL_POS_ID = "psicopewebqr2";
// El "qr_code" es el contenido crudo (texto plano, formato EMV estándar de
// QR interoperable) de ESTE punto de venta -- es fijo, no cambia entre
// compras (lo que sí cambia por compra es el monto cargado aparte, ver más
// abajo). Lo mandamos tal cual al navegador para que arme la imagen del QR
// él mismo (sin el logo de Mercado Pago superpuesto que trae la imagen
// prearmada de MP -- así no da a entender que solo se puede pagar con esa
// app puntual, cuando en realidad acepta cualquier billetera QR interoperable).
const QR_CODE_PAYLOAD = "00020101021143540016com.mercadolibre0130https://mpago.la/pos/13710162050150011273383018775204970053030325802AR5913Brenda Grossi6004CABA63047ECB";

const DURACION_RESERVA_MS = 2 * 60 * 1000; // 2 minutos, igual que la espera del lado de Checkout Pro

// `referencia_externa` la genera el navegador y viaja tal cual hasta un
// filtro crudo de PostgREST (`titular.eq.${referenciaExterna}`, ver más
// abajo) -- sin esta validación, alguien podría mandar algo como
// "x,ocupado.eq.true" para inyectar una condición extra en el OR y robar
// la reserva de quien la tiene en ese momento (auditoría de seguridad,
// agosto 2026). Como el navegador SIEMPRE manda un UUID real
// (crypto.randomUUID()), exigir ese formato no rompe ningún uso legítimo.
const ES_UUID_VALIDO = (valor: unknown): valor is string =>
  typeof valor === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor);

// Todas las escrituras a "qr_reserva" van por fetch() directo a PostgREST
// (no el query builder de supabase-js) -- se probó a mano que combinar
// .update() con filtros encadenados tira "column ... does not exist" del
// lado del cliente en este runtime, aunque el mismo pedido crudo por REST
// funciona perfecto. Mismo criterio en las tres escrituras de este archivo
// para no dejar una mezcla rara de estilos.
const liberarReserva = async (titular: string) => {
  await fetch(
    `${Deno.env.get("SUPABASE_URL")}/rest/v1/qr_reserva?id=eq.1&titular=eq.${titular}`,
    {
      method: "PATCH",
      headers: {
        apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ocupado: false }),
    }
  ).catch(() => {});
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Modo "liberar": lo llama el navegador cuando el usuario cancela
    // mientras el QR seguía esperando el escaneo -- así el siguiente en la
    // fila no tiene que esperar los 2 minutos completos. Es un "mejor
    // esfuerzo": si no llega a llamarse (cerró la pestaña de golpe), la
    // reserva igual vence sola por `expira_en`.
    if (body?.accion === "liberar" && body?.referencia_externa) {
      if (!ES_UUID_VALIDO(body.referencia_externa)) throw new Error("Referencia inválida");
      await liberarReserva(body.referencia_externa);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { material_id, invitado } = body;
    if (!material_id) throw new Error("Falta material_id");

    // La referencia la genera el NAVEGADOR (una sola vez, al arrancar el
    // intento) y la manda en cada reintento mientras espera su turno --
    // no una nueva acá cada vez. Es la clave de idempotencia: si esta
    // función se llega a ejecutar dos veces para "el mismo" pedido (se
    // observó que a veces pasa), la segunda ejecución reconoce la reserva
    // que dejó la primera como propia (por `titular.eq.miReferencia` en
    // el WHERE de abajo) en vez de leerla como "ocupado por otro".
    // Si viene del navegador, TIENE que ser un UUID real -- si no, alguien
    // está mandando algo armado a mano para meter una condición extra en el
    // filtro de más abajo (ver ES_UUID_VALIDO).
    if (body.referencia_externa && !ES_UUID_VALIDO(body.referencia_externa)) {
      throw new Error("Referencia inválida");
    }
    const referenciaExterna: string = body.referencia_externa || crypto.randomUUID();

    // Quién compra: mismo criterio que crear-preferencia (usuario logueado
    // o invitado con nombre/apellido/email).
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

    // PASO CLAVE (concurrencia): intento atómico de tomar la reserva del
    // único QR compartido. Este UPDATE con WHERE solo afecta la fila si
    // estaba libre, si la reserva anterior ya venció, O si el titular ya
    // era ESTA MISMA referencia (reintento propio, ver arriba) -- eso lo
    // resuelve Postgres a nivel de fila, así que dos pedidos simultáneos
    // de dos personas DISTINTAS nunca "ganan" los dos a la vez. Si no
    // afecta ninguna fila, alguien más lo está usando ahora mismo -- el
    // navegador reintenta solo, más tarde.
    const ahora = new Date().toISOString();
    const expiraEn = new Date(Date.now() + DURACION_RESERVA_MS).toISOString();

    // Nota: este UPDATE se manda con fetch() directo a PostgREST, no con
    // el query builder de supabase-js -- combinar .update().or() acá tira
    // "column ... does not exist" del lado del cliente (se probó a mano:
    // el mismo pedido crudo por REST funciona perfecto, así que es cosa
    // del cliente JS en este runtime, no de la base).
    const reservaResp = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/rest/v1/qr_reserva?id=eq.1&or=(ocupado.eq.false,expira_en.lt.${ahora},titular.eq.${referenciaExterna})`,
      {
        method: "PATCH",
        headers: {
          apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          ocupado: true,
          titular: referenciaExterna,
          material_id,
          email: payerEmail,
          expira_en: expiraEn,
          actualizado_en: ahora,
        }),
      }
    );
    if (!reservaResp.ok) throw new Error(`No se pudo tomar la reserva del QR: ${await reservaResp.text()}`);
    const filaGanada = await reservaResp.json();

    if (!filaGanada || filaGanada.length === 0) {
      return new Response(JSON.stringify({ ocupado: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Se ganó la reserva -- de acá en más, todo esto es solo para ESTE
    // comprador hasta que pague o venza el tiempo.
    try {
      // Si esta MISMA referencia ya había llegado hasta acá antes (otra
      // ejecución duplicada de este mismo pedido, ver nota de arriba), no
      // hay que volver a insertar la compra pendiente ni recargar el QR
      // -- ya está todo hecho, solo devolvemos el mismo resultado.
      const { data: yaProcesada } = await supabaseAdmin
        .from("compras")
        .select("id")
        .eq("external_reference", referenciaExterna)
        .maybeSingle();
      if (yaProcesada) {
        return new Response(JSON.stringify({
          ok: true,
          referencia_externa: referenciaExterna,
          qr_code_payload: QR_CODE_PAYLOAD,
          expira_en: expiraEn,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: material, error: matError } = await supabaseAdmin
        .from("materiales")
        .select("id, nombre, precio, en_oferta, porcentaje_descuento")
        .eq("id", material_id)
        .single();
      if (matError || !material) throw new Error("Material no encontrado");

      const precioFinal = material.en_oferta
        ? material.precio * (1 - material.porcentaje_descuento / 100)
        : material.precio;
      const montoRedondeado = Math.round(precioFinal * 100) / 100;

      const { error: pendienteError } = await supabaseAdmin.from("compras").insert([{
        material_id: material.id,
        external_reference: referenciaExterna,
        payment_id: `PENDIENTE_${referenciaExterna}`,
        status: "pendiente",
        email_usuario: payerEmail,
        nombre_usuario: payerNombre ? `${payerNombre} ${payerApellido || ""}`.trim() : null,
        nombre_material: material.nombre,
        precio_pagado: montoRedondeado,
        fecha: new Date().toISOString(),
      }]);
      if (pendienteError) throw pendienteError;

      // Le "carga" el monto de ESTA compra al QR fijo del punto de venta --
      // mientras esté cargado, cualquier app que lo escanee (Mercado Pago
      // u otra billetera con QR interoperable) va a ver este monto puntual.
      const cargaResp = await fetch(
        `https://api.mercadopago.com/instore/qr/seller/collectors/${MP_USER_ID}/pos/${MP_EXTERNAL_POS_ID}/orders`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${Deno.env.get("MP_ACCESS_TOKEN")}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            external_reference: referenciaExterna,
            title: material.nombre,
            description: material.nombre,
            notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mp-webhook`,
            total_amount: montoRedondeado,
            items: [{
              title: material.nombre,
              unit_price: montoRedondeado,
              quantity: 1,
              unit_measure: "unit",
              total_amount: montoRedondeado,
            }],
          }),
        }
      );
      if (!cargaResp.ok) {
        const detalle = await cargaResp.text();
        throw new Error(`No se pudo cargar el monto en el QR: ${detalle}`);
      }

      return new Response(JSON.stringify({
        ok: true,
        referencia_externa: referenciaExterna,
        qr_code_payload: QR_CODE_PAYLOAD,
        expira_en: expiraEn,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } catch (errorInterno) {
      // Si algo de acá arriba falla, hay que soltar la reserva -- si no,
      // el QR queda "trabado" ocupado por nadie hasta que venza sola.
      await liberarReserva(referenciaExterna);
      throw errorInterno;
    }
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
