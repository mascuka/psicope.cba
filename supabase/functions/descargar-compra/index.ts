import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Le da al front (página de "Success" post-pago) un link de descarga firmado
// para la compra que se acaba de confirmar -- sirve tanto para usuarios
// logueados como para invitados sin cuenta, porque no depende de una sesión:
// verifica directo contra la fila real en "compras" usando el payment_id.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { payment_id } = await req.json();
    if (!payment_id) throw new Error("Falta payment_id");

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: compra, error } = await supabaseAdmin
      .from("compras")
      .select("nombre_material, materiales ( archivo_url, nombre_descarga )")
      .eq("payment_id", String(payment_id))
      .eq("status", "approved")
      .maybeSingle();

    if (error) throw error;
    if (!compra) throw new Error("Todavía no encontramos esa compra confirmada");

    const archivoUrl = compra.materiales?.archivo_url;
    if (!archivoUrl) throw new Error("El material no tiene archivo configurado");

    const fileName = archivoUrl.includes("/") ? archivoUrl.split("/").pop().split("?")[0] : archivoUrl;
    const extension = fileName.includes(".") ? fileName.split(".").pop() : "pdf";
    const nombreLimpio = (compra.materiales?.nombre_descarga || compra.nombre_material || "material")
      .trim()
      .replace(/[\\/:*?"<>|]/g, "")
      .slice(0, 100);
    const nombreDescarga = `${nombreLimpio || "material"}.${extension}`;

    const { data: signed, error: signError } = await supabaseAdmin.storage
      .from("materiales-privados")
      .createSignedUrl(fileName, 120, { download: nombreDescarga });
    if (signError) throw signError;

    return new Response(
      JSON.stringify({ signedUrl: signed.signedUrl, nombreMaterial: compra.nombre_material }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
