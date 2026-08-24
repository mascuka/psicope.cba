import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODELO_GEMINI = "gemini-3.6-flash";
// Nota sobre las imágenes: se probó generarlas con el modelo de imagen de
// Gemini (gemini-2.5-flash-preview-image), pero ese modelo tiene cuota 0 en
// el plan gratuito (confirmado en vivo: "Quota exceeded... limit: 0") -- no
// hay forma de usarlo sin facturación. Por eso el fondo del posteo ahora se
// arma 100% en el navegador con Canvas / fotos reales de bancos gratuitos
// (ver AsistenteIA.jsx -> componerImagenPost), sin depender de ninguna API
// de imágenes paga.

const FUENTE_HEADERS = { "User-Agent": "PsicopeCbaAsistenteIA/1.0 (sitio de psicopedagogia, uso interno para borradores de Instagram; contacto: mascuka410@gmail.com)" };

type FuenteCientifica = { titulo: string; autores: string | null; anio: string | null; revista: string | null; url: string; base: "PubMed" | "CrossRef" };

// PubMed (NCBI E-utilities): gratis, sin key, buen límite de pedidos por
// segundo -- literatura biomédica real, exactamente el terreno de
// "neurociencias, neuropsicología" que pidió la clienta. Devuelve un PMID
// real, con link directo a pubmed.ncbi.nlm.nih.gov -- una fuente que
// cualquiera puede abrir y chequear, no un resumen genérico.
async function buscarEnPubMed(terminosEn: string): Promise<FuenteCientifica | null> {
  try {
    const searchResp = await fetch(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(terminosEn)}&retmode=json&retmax=1&sort=relevance`,
      { headers: FUENTE_HEADERS }
    );
    if (!searchResp.ok) return null;
    const searchData = await searchResp.json();
    const pmid = searchData?.esearchresult?.idlist?.[0];
    if (!pmid) return null;

    const summaryResp = await fetch(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${pmid}&retmode=json`,
      { headers: FUENTE_HEADERS }
    );
    if (!summaryResp.ok) return null;
    const summaryData = await summaryResp.json();
    const item = summaryData?.result?.[pmid];
    if (!item?.title) return null;

    const autores = (item.authors || []).slice(0, 3).map((a: { name: string }) => a.name).join(", ") || null;
    return {
      titulo: item.title,
      autores,
      anio: item.pubdate?.slice(0, 4) || null,
      revista: item.source || null,
      url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      base: "PubMed",
    };
  } catch (err) {
    console.error("No se pudo buscar en PubMed:", err);
    return null;
  }
}

// CrossRef: respaldo cuando PubMed no encuentra nada -- cubre revistas de
// psicología/educación que PubMed (más volcado a lo biomédico puro) a
// veces no indexa. También gratis, sin key, devuelve un DOI real.
async function buscarEnCrossRef(terminosEn: string): Promise<FuenteCientifica | null> {
  try {
    const resp = await fetch(
      `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(terminosEn)}&filter=type:journal-article&rows=1&select=title,author,DOI,container-title,published`,
      { headers: FUENTE_HEADERS }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    const item = data?.message?.items?.[0];
    if (!item?.title?.[0] || !item?.DOI) return null;

    const autores = (item.author || [])
      .slice(0, 3)
      .map((a: { given?: string; family?: string }) => `${a.given || ""} ${a.family || ""}`.trim())
      .filter(Boolean)
      .join(", ") || null;
    return {
      titulo: item.title[0],
      autores,
      anio: item.published?.["date-parts"]?.[0]?.[0]?.toString() || null,
      revista: item["container-title"]?.[0] || null,
      url: `https://doi.org/${item.DOI}`,
      base: "CrossRef",
    };
  } catch (err) {
    console.error("No se pudo buscar en CrossRef:", err);
    return null;
  }
}

async function buscarFuenteCientifica(terminosEn: string): Promise<FuenteCientifica | null> {
  return (await buscarEnPubMed(terminosEn)) || (await buscarEnCrossRef(terminosEn));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { tema, feedback_para_id, feedback_texto } = await req.json();

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Solo administradores pueden usar el asistente.
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabaseAdmin.auth.getUser(token);
    if (!user) throw new Error("No autenticado");
    const { data: perfil } = await supabaseAdmin.from("usuarios").select("rol").eq("id", user.id).single();
    if (perfil?.rol !== "admin") throw new Error("Solo un administrador puede usar el asistente");

    // Si viene feedback sobre un intento anterior, lo guardamos ahí antes de
    // generar el siguiente -- así ese intento queda marcado con lo que no
    // sirvió, y entra al historial que lee la IA la próxima vez.
    let postAnterior = null;
    if (feedback_para_id && feedback_texto) {
      await supabaseAdmin.from("asistente_ig_posts").update({ feedback: feedback_texto }).eq("id", feedback_para_id);
      const { data } = await supabaseAdmin
        .from("asistente_ig_posts")
        .select("tema, titulo, contenido")
        .eq("id", feedback_para_id)
        .maybeSingle();
      postAnterior = data;
    }

    // Ejemplos de estilo: posts reales ya publicados en Psicopedagogiando.
    const { data: ejemplos } = await supabaseAdmin
      .from("psicopedagogiando")
      .select("titulo, contenido")
      .order("created_at", { ascending: false })
      .limit(10);

    // Historial de correcciones y descartes -- esto es la "memoria" del
    // asistente: cada corrección que le hicieron, y cada motivo por el que
    // se descartó un borrador, queda acá para la próxima vez. No se
    // distingue el origen (mejora pedida vs. descarte) porque para el
    // aprendizaje da igual: ambos son "esto no funcionó, no lo repitas".
    const { data: correcciones } = await supabaseAdmin
      .from("asistente_ig_posts")
      .select("tema, feedback, estado")
      .not("feedback", "is", null)
      .order("created_at", { ascending: false })
      .limit(25);

    // Temas ya usados (publicados o generados antes) -- para que en modo
    // automático no repita siempre lo mismo.
    const { data: temasPrevios } = await supabaseAdmin
      .from("asistente_ig_posts")
      .select("tema")
      .order("created_at", { ascending: false })
      .limit(30);

    const bloqueEjemplos = (ejemplos || [])
      .map((e, i) => `Ejemplo ${i + 1} (real, ya publicado -- este es EXACTAMENTE el tono y nivel que hay que igualar):\nTítulo: ${e.titulo}\nTexto: ${e.contenido}`)
      .join("\n\n") || "(Todavía no hay posts publicados para tomar de referencia)";

    const bloqueCorrecciones = (correcciones || [])
      .map((c) => `- Tema "${c.tema}" (${c.estado === "descartado" ? "se descartó" : "se pidió mejorar"}): ${c.feedback}`)
      .join("\n") || "(Todavía no hay correcciones ni descartes registrados)";

    const bloquePostAnterior = postAnterior
      ? `\nEste fue el intento anterior sobre el mismo tema, que hay que mejorar:\nTítulo: ${postAnterior.titulo}\nTexto: ${postAnterior.contenido}\nLo que pidió corregir: "${feedback_texto}"\n`
      : "";

    const bloqueTemasPrevios = [...new Set((temasPrevios || []).map((t) => t.tema).concat((ejemplos || []).map((e) => e.titulo)))]
      .join(", ") || "(ninguno todavía)";

    // Modo automático: no viene "tema" -- Gemini lo elige él mismo DENTRO de
    // la misma llamada de generación (antes era una llamada aparte solo
    // para elegir el tema, pero eso duplicaba los pedidos a Gemini y hacía
    // más fácil pisar el límite de pedidos por minuto del plan gratuito;
    // ahora es una sola llamada).
    const modoAutomatico = !tema;

    // Si pidieron un tema puntual y ya hay borradores sin publicar sobre ese
    // mismo tema (ej: generando "3 opciones distintas" del mismo tema de
    // una), que no repita el enfoque -- cada variante tiene que ser
    // realmente distinta de las anteriores.
    let bloqueVariantes = "";
    if (tema) {
      const { data: variantesExistentes } = await supabaseAdmin
        .from("asistente_ig_posts")
        .select("titulo, contenido")
        .eq("tema", tema)
        .eq("estado", "borrador")
        .order("created_at", { ascending: false })
        .limit(5);
      if (variantesExistentes?.length) {
        bloqueVariantes = `\nYA HAY OTRAS VERSIONES SOBRE ESTE MISMO TEMA EN ESTA MISMA TANDA (elegí un ángulo, ejemplo, estructura o enfoque DISTINTO a estas -- no repitas la idea central):\n${variantesExistentes.map((v, i) => `Versión ${i + 1}: "${v.titulo}" -- ${(v.contenido || "").slice(0, 150)}...`).join("\n")}\n`;
      }
    }

    const prompt = `
Sos el asistente de redes sociales de Brenda Grossi, Licenciada en Psicopedagogía, con consultorio en Córdoba Capital, Argentina. Tu trabajo es escribir posteos para su Instagram profesional (@psicope.cba), imitando su estilo real.

CÓMO ES LA CUENTA REAL (@psicope.cba, revisada directamente con capturas de pantalla): gráficas de colores pasteles suaves (rosa, durazno, lila, celeste, menta), con motivos de arcoíris, estrellitas y bordes punteados, tipografía redondeada/informal para las preguntas o frases cortas. Cálida y cercana, no corporativa ni acartonada -- pero el CONTENIDO del texto sigue siendo serio y profesional (una psicopedagoga hablándole a familias y docentes), solo el diseño visual es lúdico y colorido.

ESTILO DE ESCRITURA A IMITAR (posts reales ya publicados por ella):
${bloqueEjemplos}

CORRECCIONES Y DESCARTES DEL PASADO (tenelas siempre en cuenta, son aprendizaje acumulado -- no repitas lo que ya no funcionó):
${bloqueCorrecciones}
${bloquePostAnterior}
TEMAS YA USADOS ANTES (no los repitas): ${bloqueTemasPrevios}

${modoAutomatico
  ? `No te dieron un tema puntual: elegí vos mismo uno de psicopedagogía relevante, útil y variado (distinto a los ya usados) para padres/docentes que siguen esta cuenta, y devolvelo en "tema_elegido".`
  : `TEMA DE ESTE POSTEO: "${tema}"`
}
${feedback_texto && !postAnterior ? `INSTRUCCIÓN ADICIONAL: ${feedback_texto}\n` : ""}
${bloqueVariantes}

FORMA DE TRABAJAR (importante, priorizá calidad sobre velocidad):
Antes de escribir la versión final, pensá vos mismo internamente al menos 2 o 3 enfoques posibles para el tema (distintos ángulos, ejemplos o estructuras) y elegí el mejor -- no entregues el primer borrador que se te ocurra. El contenido tiene que apoyarse en evidencia científica real y actual, priorizando SIEMPRE esta mirada por sobre cualquier otra:
- Neurociencias y neuropsicología (cómo funciona realmente el cerebro en el aprendizaje, la atención, la lectura, las funciones ejecutivas).
- El paradigma de la neurodiversidad (las diferencias en el desarrollo -- TDAH, dislexia, autismo, etc. -- como variaciones naturales a comprender y acompañar, no como déficits a "corregir").
- Autores y referentes reales y reconocibles en ese campo (por ejemplo: Stanislas Dehaene, Rufina Pearson, entre otros según el tema puntual) -- nombralos cuando el tema puntual se los relaciona genuinamente, nunca forzado ni en cada posteo.
Nunca inventes estadísticas, estudios o citas textuales que no puedas nombrar con un marco, autor u organismo real. SIEMPRE:
- Escrito en español rioplatense de Argentina (voseo: "vos podés", "tenés"), nunca en español neutro ni de otro país.
- Adaptado a la realidad de una familia o docente de Córdoba Capital (términos escolares argentinos: "sala de 5", "primer grado", etc. -- nunca términos de otros sistemas educativos).

Escribí un posteo de Instagram sobre ese tema, tono cálido y profesional (como los ejemplos), pensado para padres/docentes interesados en psicopedagogía. El objetivo de fondo es que un padre o madre que lo lea se sienta identificado ("a mi hijo le pasa justo esto") y vea que quien escribe sabe del tema -- así le den ganas de escribirle a Brenda para pedir un turno. Para eso:
- Arrancá el "contenido" con algo concreto y reconocible (una situación cotidiana, una frase que dicen los chicos, una escena de la casa o el aula), no con una definición de manual.
- Cerrá con una invitación suave a la consulta o a escribir por mensaje si se sienten identificados -- nunca agresiva ni tipo publicidad, un cierre cálido de acompañamiento.

Además del texto largo (el "contenido", el caption completo), armá el TEXTO CORTO que va escrito arriba de la imagen del posteo, como hacen las cuentas de Instagram que arman posteos con frases -- tiene que ser corto y llamativo, de alguna de estas dos formas (elegí la que mejor quede para el tema):
a) Un problema o duda planteado como pregunta corta ("texto_imagen_principal"), y abajo una respuesta/solución muy breve ("texto_imagen_secundario").
b) Un tema puntual como título corto ("texto_imagen_principal"), y abajo una frase breve que lo resume o invita a leer más ("texto_imagen_secundario").
Ambos textos tienen que ser MUY cortos (texto_imagen_principal: máximo 8 palabras: texto_imagen_secundario: máximo 12 palabras), porque van superpuestos sobre la imagen del posteo (formato 9:16, alta y angosta, tipo historia/short de Instagram).

También devolvé "referencias_generales": una lista de 1 a 3 nombres de marcos, autores, criterios diagnósticos u organismos reales en los que se apoya el contenido (ej: ["Neurociencia de la lectura (Dehaene)", "Paradigma de la neurodiversidad"]), para que Brenda pueda verificarlos antes de publicar. Si el posteo no se apoya en nada puntual verificable, devolvé una lista vacía -- no inventes una referencia solo para completar el campo.

Por último, devolvé "terminos_busqueda_cientifica_en": de 3 a 6 palabras clave EN INGLÉS (aunque el posteo esté en español) que describan el tema científico de fondo de este posteo, pensadas para buscar un artículo científico real que lo respalde (ej: para un posteo sobre dislexia: "dyslexia reading neuroscience children"). Elegí palabras específicas del campo neurocientífico/neuropsicológico del tema, no genéricas.
    `.trim();

    const schema = {
      type: "OBJECT",
      properties: {
        tema_elegido: { type: "STRING" },
        titulo: { type: "STRING" },
        contenido: { type: "STRING" },
        texto_imagen_principal: { type: "STRING" },
        texto_imagen_secundario: { type: "STRING" },
        referencias_generales: { type: "ARRAY", items: { type: "STRING" } },
        terminos_busqueda_cientifica_en: { type: "STRING" },
      },
      required: ["tema_elegido", "titulo", "contenido", "texto_imagen_principal", "texto_imagen_secundario", "referencias_generales", "terminos_busqueda_cientifica_en"],
    };

    const geminiResp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODELO_GEMINI}:generateContent?key=${Deno.env.get("GEMINI_API_KEY")}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", responseSchema: schema },
        }),
      }
    );

    const geminiData = await geminiResp.json();
    if (!geminiResp.ok) throw new Error(geminiData?.error?.message || "Error consultando a Gemini");

    const textoJson = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textoJson) throw new Error("Gemini no devolvió contenido");
    const resultado = JSON.parse(textoJson);
    const temaFinal = tema || resultado.tema_elegido || "Psicopedagogía";

    // La búsqueda de la fuente científica se hace DESPUÉS de escribir (en
    // los dos modos, no solo en el automático) -- ya no guía la redacción
    // (Gemini escribe con su propio conocimiento del campo, con la
    // instrucción de priorizar neurociencia/neuropsicología/neurodiversidad
    // de arriba), solo sirve para citar una fuente real y verificable,
    // usando los términos en inglés que el propio modelo ya generó como
    // parte de esta misma respuesta (no hace falta otro pedido a Gemini
        // para traducir).
    const fuenteCientifica = await buscarFuenteCientifica(resultado.terminos_busqueda_cientifica_en || temaFinal);

    // El fondo del posteo ya NO se busca/genera acá -- se arma en el
    // navegador (ver AsistenteIA.jsx), así que este endpoint solo devuelve
    // el texto. `imagen_url` queda en null (columna que antes guardaba la
    // foto externa, ya no aplica).
    const { data: nuevoPost, error: insertError } = await supabaseAdmin
      .from("asistente_ig_posts")
      .insert([{
        tema: temaFinal,
        instrucciones_extra: feedback_texto || null,
        titulo: resultado.titulo,
        contenido: resultado.contenido,
        imagen_url: null,
        texto_imagen_principal: resultado.texto_imagen_principal,
        texto_imagen_secundario: resultado.texto_imagen_secundario,
        fuente_cientifica: fuenteCientifica,
        referencias_generales: resultado.referencias_generales || [],
        estado: "borrador",
      }])
      .select("id")
      .single();
    if (insertError) throw insertError;

    return new Response(
      JSON.stringify({
        id: nuevoPost.id,
        tema: temaFinal,
        titulo: resultado.titulo,
        contenido: resultado.contenido,
        texto_imagen_principal: resultado.texto_imagen_principal,
        texto_imagen_secundario: resultado.texto_imagen_secundario,
        fuente_cientifica: fuenteCientifica,
        referencias_generales: resultado.referencias_generales || [],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
