// Manda un mail con el Gmail real de Brenda (SMTP + contraseña de
// aplicación). Reemplaza a denomailer, que armaba mensajes mal formados:
// asunto RFC 2047 con espacios y comillas sin codificar, "Psicope.cba" sin
// comillas en el From, quoted-printable con hex en minúscula y espacios al
// final de línea. Gmail los "arreglaba" después de firmarlos, la firma DKIM
// dejaba de coincidir y Gmail del otro lado los rechazaba:
// "550 5.7.30 DKIM authentication didn't pass" (y le volvía el rebote a
// Brenda, con la copia del mail enviado en el mismo hilo).
// Acá el mensaje va armado a mano y en base64, que no deja nada para
// "arreglar".

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const base64 = (texto: string) => {
  let binario = "";
  for (const byte of encoder.encode(texto)) binario += String.fromCharCode(byte);
  return btoa(binario);
};

// Cuerpo en base64, partido en líneas de 76 (límite de MIME).
const base64EnLineas = (texto: string) => base64(texto).match(/.{1,76}/g)!.join("\r\n");

// Encabezado con tildes/ñ: palabras "=?UTF-8?B?...?=" de hasta 75
// caracteres cada una (RFC 2047), cortando entre letras y nunca en el medio
// de una letra UTF-8.
const codificarEncabezado = (texto: string) => {
  if (/^[\x20-\x7e]*$/.test(texto)) return texto;
  const partes: string[] = [];
  let actual = "";
  for (const letra of texto) {
    if (encoder.encode(actual + letra).length > 45) {
      partes.push(actual);
      actual = "";
    }
    actual += letra;
  }
  partes.push(actual);
  return partes.map((p) => `=?UTF-8?B?${base64(p)}?=`).join("\r\n ");
};

// Versión en texto plano del HTML (los filtros de spam desconfían de un
// mail sin texto real): los links quedan como "texto: url".
const htmlATexto = (html: string) => html
  .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, url, texto) => `${texto.trim()}: ${url}`)
  .replace(/<br\s*\/?>/gi, "\n")
  .replace(/<\/(p|h\d)>/gi, "\n\n")
  .replace(/<hr\s*\/?>/gi, "\n---\n\n")
  .replace(/<[^>]+>/g, "")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&")
  .replace(/[ \t]*\n[ \t]*/g, "\n")
  .replace(/\n{3,}/g, "\n\n")
  .trim();

export async function enviarMailGmail({ para, asunto, html }: { para: string; asunto: string; html: string }) {
  const usuario = Deno.env.get("GMAIL_USER")!;
  const limite = `limite_${crypto.randomUUID()}`;

  const mensaje = [
    `From: "Psicope.cba" <${usuario}>`,
    `To: <${para}>`,
    `Subject: ${codificarEncabezado(asunto)}`,
    `Date: ${new Date().toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${crypto.randomUUID()}@psicope-cba.com.ar>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${limite}"`,
    "",
    `--${limite}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64EnLineas(htmlATexto(html)),
    `--${limite}`,
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    base64EnLineas(html),
    `--${limite}--`,
  ].join("\r\n");

  const conexion = await Deno.connectTls({ hostname: "smtp.gmail.com", port: 465 });
  const buffer = new Uint8Array(4096);
  let pendiente = "";

  const escribir = async (texto: string) => {
    const bytes = encoder.encode(texto);
    let escritos = 0;
    while (escritos < bytes.length) escritos += await conexion.write(bytes.subarray(escritos));
  };

  // Una respuesta SMTP puede tener varias líneas ("250-...") y termina en la
  // que lleva un espacio después del código ("250 ...").
  const leerRespuesta = async () => {
    while (true) {
      const lineas = pendiente.split("\r\n");
      for (let i = 0; i < lineas.length - 1; i++) {
        if (/^\d{3} /.test(lineas[i])) {
          pendiente = lineas.slice(i + 1).join("\r\n");
          return lineas[i];
        }
      }
      const leidos = await conexion.read(buffer);
      if (leidos === null) throw new Error("Gmail cortó la conexión");
      pendiente += decoder.decode(buffer.subarray(0, leidos));
    }
  };

  const comando = async (linea: string | null, codigoEsperado: string) => {
    if (linea !== null) await escribir(`${linea}\r\n`);
    const respuesta = await leerRespuesta();
    if (!respuesta.startsWith(codigoEsperado)) throw new Error(`Gmail respondió: ${respuesta}`);
  };

  try {
    await comando(null, "220");
    await comando("EHLO psicope-cba.com.ar", "250");
    await comando("AUTH LOGIN", "334");
    await comando(btoa(usuario), "334");
    await comando(btoa(Deno.env.get("GMAIL_APP_PASSWORD")!), "235");
    await comando(`MAIL FROM:<${usuario}>`, "250");
    await comando(`RCPT TO:<${para}>`, "250");
    await comando("DATA", "354");
    // Una línea que empieza con "." se duplica (si no, SMTP la toma como fin
    // del mensaje). En base64 no pasa, pero por las dudas.
    await comando(`${mensaje.replace(/\r\n\./g, "\r\n..")}\r\n.`, "250");
    await comando("QUIT", "221").catch(() => {});
  } finally {
    conexion.close();
  }
}
