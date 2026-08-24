import React, { useEffect, useState, useRef } from "react";
import { supabase } from "../supabase/supabaseClient";
import Swal from "sweetalert2";
import { FaMagic, FaTimes, FaShareSquare, FaSpinner, FaTrash, FaBookOpen, FaExclamationTriangle, FaImage, FaSyncAlt, FaRedo, FaFont, FaEdit } from "react-icons/fa";
import "./AsistenteIA.css";
import logoImage from "../assets/logo.png";

const MAX_SLOTS = 1;
// Tamaño del "recuadro" agarrable de cada texto (ver JSX, ia-frame-texto) --
// no se calcula pixel a pixel a partir de las líneas reales (cada estilo
// las envuelve distinto), es un área generosa y fija alrededor del centro
// real que devolvió la función de estilo, ancha y alta como para cubrir
// cómodamente 2-4 líneas de texto en cualquiera de las plantillas.
const ZONA_TEXTO_ANCHO = 0.8; // fracción de ANCHO
const ZONA_TEXTO_ALTO = 300; // px lógicos (de 1920)
const estiloZonaTexto = (anclaY) => ({
  left: `${((1 - ZONA_TEXTO_ANCHO) / 2) * 100}%`,
  width: `${ZONA_TEXTO_ANCHO * 100}%`,
  top: `${((anclaY - ZONA_TEXTO_ALTO / 2) / ALTO) * 100}%`,
  height: `${(ZONA_TEXTO_ALTO / ALTO) * 100}%`,
});
// Formato historia/short (9:16), igual que las cards de Psicopedagogiando en
// la web -- antes era cuadrado (1:1) y no coincidía con cómo se ve publicado.
const ANCHO = 1080;
const ALTO = 1920;
// El canvas se dibuja a esta resolución más alta y se exporta así (no se
// baja a 1080x1920 después) -- con más píxeles reales, el texto y las
// líneas finas se ven nítidos tanto en la miniatura chica de la grilla
// como si alguien la mira grande. Todo el código de las plantillas sigue
// pensado en unidades "lógicas" de 1080x1920 -- ver ctx.scale más abajo.
const ESCALA_EXPORT = 2;

const cargarImagen = (url) => new Promise((resolve, reject) => {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = url;
});

// El isotipo de la marca de agua se pide una sola vez y se reusa -- se
// compone en TODAS las imágenes, así que no tiene sentido recargarlo en
// cada llamada a componerImagenPost.
let logoMarcaPromesa = null;
const cargarLogoMarca = () => {
  if (!logoMarcaPromesa) logoMarcaPromesa = cargarImagen(logoImage);
  return logoMarcaPromesa;
};

// Mientras se arrastra un texto, lo ÚNICO que cambia entre un frame y el
// siguiente es dónde va ESE texto -- el fondo (ilustrado con sus blobs/
// garabatos/stickers, o la foto real con su velo y sparkle) es idéntico
// frame a frame (misma semilla, ver arriba). Antes se volvía a dibujar
// TODO el fondo en cada recomposición, que es la parte más pesada del
// dibujo (decenas de formas con su propio save/restore) -- eso era lo que
// se sentía lento/trabado al mover el texto. Este cache guarda el fondo ya
// dibujado (como canvas, listo para pegar con drawImage) por combinación
// de fondo+semilla, así que un arrastre entero solo dibuja el fondo UNA
// vez y de ahí en más solo mueve el/los textos, mucho más rápido. Tamaño
// chico a propósito (cada canvas cacheado pesa varios MB) -- alcanza con
// guardar el fondo recién usado, no hace falta un historial largo.
const fondoCache = new Map();
const FONDO_CACHE_MAX = 3;
const obtenerFondoCacheado = async (clave, dibujar) => {
  if (fondoCache.has(clave)) return fondoCache.get(clave);
  const canvas = document.createElement("canvas");
  canvas.width = ANCHO * ESCALA_EXPORT;
  canvas.height = ALTO * ESCALA_EXPORT;
  const ctxFondo = canvas.getContext("2d");
  ctxFondo.scale(ESCALA_EXPORT, ESCALA_EXPORT);
  const extra = await dibujar(ctxFondo);
  const entrada = { canvas, extra };
  if (fondoCache.size >= FONDO_CACHE_MAX) {
    fondoCache.delete(fondoCache.keys().next().value);
  }
  fondoCache.set(clave, entrada);
  return entrada;
};

// Todas las funciones de fondo (blobs, garabatos, stickers, confeti...) y
// alguna decoración de texto (el óvalo/onda que resalta la secundaria en
// foto real) usan Math.random() para variar cada vez que se dibujan -- eso
// está bien la primera vez, pero significa que CUALQUIER recomposición
// (arrastrar el texto, cambiarle el color, editarlo) volvía a tirar los
// dados y el fondo entero "cambiaba" de golpe, aunque nada relacionado a él
// se haya tocado. La solución: durante una recomposición que solo debe
// tocar texto, se pisa Math.random con una versión determinística (mismo
// semilla = mismos números, siempre) SOLO mientras dura el dibujado del
// fondo/decoración, y se restaura enseguida -- ninguna otra función de este
// archivo necesita enterarse de esto.
const crearRngDesdeSemilla = (semilla) => {
  let s = (semilla >>> 0) || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const dibujarConSemilla = (semilla, fn) => {
  const randomOriginal = Math.random;
  Math.random = crearRngDesdeSemilla(semilla);
  try {
    return fn();
  } finally {
    Math.random = randomOriginal;
  }
};

// Dibuja "img" cubriendo todo (x,y,w,h), recortando lo que sobra (object-fit: cover).
const dibujarCover = (ctx, img, x, y, w, h) => {
  const escala = Math.max(w / img.width, h / img.height);
  const anchoEscalado = img.width * escala;
  const altoEscalado = img.height * escala;
  const offsetX = x - (anchoEscalado - w) / 2;
  const offsetY = y - (altoEscalado - h) / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(img, offsetX, offsetY, anchoEscalado, altoEscalado);
  ctx.restore();
};

// Envuelve un texto en líneas que entren en "maxAncho", devuelve el array
// de líneas ya armado para dibujar una por una.
const envolverTexto = (ctx, texto, maxAncho) => {
  const palabras = (texto || "").split(/\s+/).filter(Boolean);
  const lineas = [];
  let lineaActual = "";
  for (const palabra of palabras) {
    const prueba = lineaActual ? `${lineaActual} ${palabra}` : palabra;
    if (ctx.measureText(prueba).width > maxAncho && lineaActual) {
      lineas.push(lineaActual);
      lineaActual = palabra;
    } else {
      lineaActual = prueba;
    }
  }
  if (lineaActual) lineas.push(lineaActual);
  return lineas;
};

// Paletas pasteles + motivo decorativo, en la onda real de @psicope.cba
// (arcoíris, colores suaves, bordes punteados) en vez de una foto de stock
// genérica que no tenía nada que ver con la cuenta real.
const PALETAS = [
  { fondo1: "#FFE3EA", fondo2: "#FFD1DC", texto: "#5B2A3A", acento: "#FF9AA2" },
  { fondo1: "#FFF1DC", fondo2: "#FFE0B2", texto: "#5C3D1E", acento: "#FFB74D" },
  { fondo1: "#E3F6E5", fondo2: "#C8E6C9", texto: "#234D2B", acento: "#81C784" },
  { fondo1: "#E3F1FD", fondo2: "#D1E9FC", texto: "#1E3A5C", acento: "#64B5F6" },
  { fondo1: "#F4E7FB", fondo2: "#E1D5F5", texto: "#3E2452", acento: "#BA68C8" },
  { fondo1: "#DFF7F1", fondo2: "#BFEDE2", texto: "#0F4A3E", acento: "#4FBFA3" },
  { fondo1: "#FFE9DE", fondo2: "#FFD3BE", texto: "#6B2E17", acento: "#FF8A5C" },
  { fondo1: "#FFF6D9", fondo2: "#FFECA8", texto: "#5C4A12", acento: "#F2C94C" },
  { fondo1: "#E1F5F5", fondo2: "#BFE8E8", texto: "#0F3D3D", acento: "#2FA8A8" },
  { fondo1: "#FFE1F0", fondo2: "#FFC2E2", texto: "#5C1B41", acento: "#E85CA8" },
  { fondo1: "#ECEAFB", fondo2: "#D8D4F5", texto: "#332B66", acento: "#8C7FE0" },
  { fondo1: "#EEF7DA", fondo2: "#DCEFAE", texto: "#3B4A16", acento: "#9CC444" },
];
const RAINBOW = ["#FFADAD", "#FFD6A5", "#FDFFB6", "#CAFFBF", "#9BF6FF", "#A0C4FF", "#BDB2FF"];

// Fuentes para el título y el texto corto -- antes cada plantilla tenía
// una tipografía fija de título (Baloo 2 en unas, Fredoka en otras...) y
// siempre la misma para el texto (Manrope), así que entre 3 posteos
// parecían todos calcados. Ahora se sortea UNA combinación por imagen
// (no por plantilla) entre varias familias con onda distinta -- redondas,
// geométricas y una manuscrita -- para que cada posteo tenga su propia
// letra, como armaría alguien jugando con Canva.
const FUENTES_TITULO = [
  { familia: "Baloo 2", peso: 800 },
  { familia: "Fredoka", peso: 700 },
  { familia: "Quicksand", peso: 700 },
  { familia: "Poppins", peso: 800 },
  { familia: "Nunito", peso: 800 },
  { familia: "Comfortaa", peso: 700 },
  { familia: "Patrick Hand", peso: 400 },
];
const FUENTES_SECUNDARIA = [
  { familia: "Manrope", peso: 700 },
  { familia: "Plus Jakarta Sans", peso: 600 },
  { familia: "Nunito", peso: 700 },
  { familia: "Quicksand", peso: 600 },
  { familia: "Karla", peso: 600 },
];
const elegirFuentes = () => ({
  titulo: FUENTES_TITULO[Math.floor(Math.random() * FUENTES_TITULO.length)],
  texto: FUENTES_SECUNDARIA[Math.floor(Math.random() * FUENTES_SECUNDARIA.length)],
});
const fontTitulo = (f, tamano) => `${f.titulo.peso} ${tamano}px '${f.titulo.familia}', 'Baloo 2', sans-serif`;
const fontTexto = (f, tamano) => `${f.texto.peso} ${tamano}px '${f.texto.familia}', 'Manrope', sans-serif`;

// Combo de letras propio del estilo "foto real" (ver ESTILOS_TEXTO_FOTO más
// abajo) -- serif grande y firme en mayúsculas para lo principal, más una
// secundaria elegante que alterna entre itálica clásica y manuscrita
// suelta, calcado de lo que se ve en las referencias reales (algunas con
// itálica tipo "versión", otras con cursiva tipo "viernes"/"Miercoles").
// Es un pool aparte de FUENTES_TITULO/FUENTES_SECUNDARIA porque acá no
// buscamos la onda redonda/juguetona de los fondos ilustrados, sino algo
// más editorial/cálido, a tono con una foto real de escritorio.
const FUENTES_TITULO_FOTO = [
  { familia: "Playfair Display", peso: 900 },
  { familia: "Fraunces", peso: 900 },
];
const FUENTES_SCRIPT = [
  { familia: "Playfair Display", peso: 600, italica: true },
  { familia: "Caveat", peso: 700, italica: false },
];
const elegirFuentesFoto = () => ({
  titulo: FUENTES_TITULO_FOTO[Math.floor(Math.random() * FUENTES_TITULO_FOTO.length)],
  texto: FUENTES_SCRIPT[Math.floor(Math.random() * FUENTES_SCRIPT.length)],
});
const fontTituloFoto = (f, tamano) => `${f.titulo.peso} ${tamano}px '${f.titulo.familia}', 'Playfair Display', serif`;
const fontScript = (f, tamano) => `${f.texto.italica ? "italic " : ""}${f.texto.peso} ${tamano}px '${f.texto.familia}', 'Playfair Display', serif`;

const dibujarArcoiris = (ctx, cx, cy, radio, grosor) => {
  RAINBOW.forEach((color, i) => {
    ctx.beginPath();
    ctx.arc(cx, cy, radio - i * grosor, Math.PI, 2 * Math.PI);
    ctx.strokeStyle = color;
    ctx.lineWidth = grosor * 0.85;
    ctx.lineCap = "round";
    ctx.stroke();
  });
};

const dibujarBlob = (ctx, x, y, r, color, alpha) => {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
};

const dibujarEstrella = (ctx, cx, cy, r, color) => {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const ang = (Math.PI / 2) * i;
    ctx.moveTo(cx, cy);
    ctx.quadraticCurveTo(cx + Math.cos(ang + 0.3) * r * 0.35, cy + Math.sin(ang + 0.3) * r * 0.35, cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
    ctx.quadraticCurveTo(cx + Math.cos(ang - 0.3) * r * 0.35, cy + Math.sin(ang - 0.3) * r * 0.35, cx, cy);
  }
  ctx.fill();
  ctx.restore();
};

const dibujarCorazon = (ctx, cx, cy, r, color) => {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy + r * 0.3);
  ctx.bezierCurveTo(cx - r * 1.3, cy - r * 0.6, cx - r * 0.5, cy - r * 1.35, cx, cy - r * 0.45);
  ctx.bezierCurveTo(cx + r * 0.5, cy - r * 1.35, cx + r * 1.3, cy - r * 0.6, cx, cy + r * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

const dibujarLibro = (ctx, cx, cy, s, color) => {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - s * 0.1);
  ctx.quadraticCurveTo(cx - s * 0.9, cy - s * 0.55, cx - s * 0.9, cy - s * 0.05);
  ctx.lineTo(cx - s * 0.9, cy + s * 0.6);
  ctx.quadraticCurveTo(cx - s * 0.4, cy + s * 0.3, cx, cy + s * 0.6);
  ctx.quadraticCurveTo(cx + s * 0.4, cy + s * 0.3, cx + s * 0.9, cy + s * 0.6);
  ctx.lineTo(cx + s * 0.9, cy - s * 0.05);
  ctx.quadraticCurveTo(cx + s * 0.9, cy - s * 0.55, cx, cy - s * 0.1);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

const dibujarLapiz = (ctx, cx, cy, s, color) => {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-Math.PI / 5);
  ctx.fillStyle = color;
  ctx.fillRect(-s * 0.15, -s, s * 0.3, s * 1.5);
  ctx.beginPath();
  ctx.moveTo(-s * 0.15, -s);
  ctx.lineTo(s * 0.15, -s);
  ctx.lineTo(0, -s * 1.35);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

const dibujarBombilla = (ctx, cx, cy, s, color) => {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = s * 0.12;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx, cy - s * 0.15, s * 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.22, cy + s * 0.35);
  ctx.lineTo(cx + s * 0.22, cy + s * 0.35);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.16, cy + s * 0.58);
  ctx.lineTo(cx + s * 0.16, cy + s * 0.58);
  ctx.stroke();
  ctx.restore();
};

const dibujarConfeti = (ctx, ancho, alto, colores, cantidad, alpha = 0.5) => {
  for (let i = 0; i < cantidad; i++) {
    const x = Math.random() * ancho;
    const y = Math.random() * alto;
    const r = 7 + Math.random() * 15;
    const color = colores[Math.floor(Math.random() * colores.length)];
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    if (Math.random() < 0.5) {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.translate(x, y);
      ctx.rotate(Math.random() * Math.PI);
      ctx.fillRect(-r / 2, -r / 2, r, r);
    }
    ctx.restore();
  }
};

const dibujarFlor = (ctx, cx, cy, r, color) => {
  ctx.save();
  ctx.fillStyle = color;
  for (let i = 0; i < 5; i++) {
    const ang = (Math.PI * 2 * i) / 5;
    ctx.beginPath();
    ctx.ellipse(cx + Math.cos(ang) * r * 0.55, cy + Math.sin(ang) * r * 0.55, r * 0.48, r * 0.3, ang, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.28, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fill();
  ctx.restore();
};

// Garabato/línea suelta a mano alzada -- da la sensación de "dibujo", como
// las líneas blancas que suele usar la cuenta real de referencia. Cada
// llamado arma una curva con una cantidad y posición de "saltos" al azar,
// para que no sea siempre la misma doble curva repetida en todos lados.
const dibujarGarabato = (ctx, x, y, ancho, alto, color, grosor = 6) => {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = grosor;
  ctx.lineCap = "round";
  ctx.globalAlpha = 0.55 + Math.random() * 0.15;
  ctx.beginPath();
  ctx.moveTo(x, y + (Math.random() - 0.5) * alto);
  const segmentos = 2 + Math.floor(Math.random() * 2);
  const paso = ancho / segmentos;
  for (let i = 0; i < segmentos; i++) {
    const cpX = x + paso * i + paso * (0.3 + Math.random() * 0.4);
    const cpY = y + (Math.random() - 0.5) * alto * 1.7;
    const finX = x + paso * (i + 1);
    const finY = y + (Math.random() - 0.5) * alto;
    ctx.quadraticCurveTo(cpX, cpY, finX, finY);
  }
  ctx.stroke();
  ctx.restore();
};

// Carita simple (círculo + ojos + sonrisa) -- uno de los "stickers" que se
// desparraman en el fondo, al estilo doodle de las referencias reales.
const dibujarCarita = (ctx, cx, cy, r, color) => {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = Math.max(2, r * 0.13);
  ctx.lineCap = "round";
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  const sep = r * 0.36;
  [-1, 1].forEach((lado) => {
    ctx.beginPath();
    ctx.arc(cx + lado * sep, cy - r * 0.15, Math.max(1.5, r * 0.1), 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.32, cy + r * 0.12);
  ctx.quadraticCurveTo(cx, cy + r * 0.55, cx + r * 0.32, cy + r * 0.12);
  ctx.stroke();
  ctx.restore();
};

// Línea ondulada corta, tipo "sube y baja" -- otro trazo suelto distinto
// al garabato de curvas libres.
const dibujarOnda = (ctx, x, y, ancho, amplitud, color, grosor = 5) => {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = grosor;
  ctx.lineCap = "round";
  ctx.globalAlpha = 0.55;
  const ciclos = 1 + Math.floor(Math.random() * 2);
  const paso = ancho / (ciclos * 2);
  ctx.beginPath();
  ctx.moveTo(x, y);
  for (let i = 0; i < ciclos * 2; i++) {
    const signo = i % 2 === 0 ? -1 : 1;
    ctx.quadraticCurveTo(x + paso * i + paso / 2, y + signo * amplitud, x + paso * (i + 1), y);
  }
  ctx.stroke();
  ctx.restore();
};

// Espiralito decorativo chico.
const dibujarEspiral = (ctx, cx, cy, r, color, grosor = 4) => {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = grosor;
  ctx.lineCap = "round";
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  const vueltas = 2;
  const pasos = 36;
  for (let i = 0; i <= pasos; i++) {
    const t = i / pasos;
    const ang = t * Math.PI * 2 * vueltas;
    const radio = r * t;
    const px = cx + Math.cos(ang) * radio;
    const py = cy + Math.sin(ang) * radio;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.restore();
};

// Óvalo dibujado a mano alzada rodeando una palabra clave -- el rulo que
// las cuentas de referencia usan para resaltar una palabra puntual (ej.
// "versión" circulado). Ligeramente irregular en vez de una elipse
// perfecta, para que se sienta trazado a mano y no vectorial.
const dibujarOvaloAcento = (ctx, cx, cy, rx, ry, color, grosor = 6) => {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = grosor;
  ctx.lineCap = "round";
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  const pasos = 40;
  for (let i = 0; i <= pasos; i++) {
    const t = (i / pasos) * Math.PI * 2;
    const jitter = 1 + (Math.random() - 0.5) * 0.06;
    const px = cx + Math.cos(t) * rx * jitter;
    const py = cy + Math.sin(t) * ry * jitter;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
};

// Crucecita/asterisco chico, tipo "sparkle" -- detalle mínimo para rincones
// sutiles.
const dibujarCruz = (ctx, cx, cy, r, color, grosor = 3) => {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = grosor;
  ctx.lineCap = "round";
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.moveTo(cx - r, cy);
  ctx.lineTo(cx + r, cy);
  ctx.moveTo(cx, cy - r);
  ctx.lineTo(cx, cy + r);
  ctx.stroke();
  ctx.restore();
};

// Íconos chicos "de acento" (círculo, corazón, libro, foco) que varían al
// azar dentro de las plantillas que los usan -- así una misma plantilla no
// siempre trae la misma decoración.
const ICONOS_ACENTO = [dibujarEstrella, dibujarCorazon, dibujarBombilla, dibujarLibro];
const elegirIcono = () => ICONOS_ACENTO[Math.floor(Math.random() * ICONOS_ACENTO.length)];

// Pool de "stickers" chicos para desparramar en el fondo -- corazón, carita,
// espiral, cruz/sparkle, onda, además de los blobs/estrellas/flores de
// siempre. Se elige al azar de acá en vez de un orden fijo, y varias de
// estas formas ya varían su propia curva cada vez que se dibujan (ver
// dibujarGarabato/dibujarCorazon con rotación al azar más abajo) -- así ni
// entre plantillas ni dentro de la misma vuelve a salir igual.
const STICKERS_VIDA = [
  (ctx, x, y, r, color) => dibujarBlob(ctx, x, y, r, color, 0.35 + Math.random() * 0.35),
  (ctx, x, y, r, color) => dibujarEstrella(ctx, x, y, r, color),
  (ctx, x, y, r, color) => dibujarFlor(ctx, x, y, r * 1.3, color),
  (ctx, x, y, r, color) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((Math.random() - 0.5) * 0.7);
    dibujarCorazon(ctx, 0, 0, r, color);
    ctx.restore();
  },
  (ctx, x, y, r, color) => dibujarCarita(ctx, x, y, r * 1.35, color),
  (ctx, x, y, r, color) => dibujarEspiral(ctx, x, y, r * 1.2, color, Math.max(3, r * 0.22)),
  (ctx, x, y, r, color) => dibujarCruz(ctx, x, y, r * 0.9, color, Math.max(2.5, r * 0.22)),
  (ctx, x, y, r, color) => dibujarOnda(ctx, x - r * 1.6, y, r * 3.2, r * 0.55, color, Math.max(3, r * 0.2)),
];
const elegirSticker = () => STICKERS_VIDA[Math.floor(Math.random() * STICKERS_VIDA.length)];

// Capa de "vida" que se suma sobre el fondo de las plantillas pastel: unos
// garabatos sueltos + stickers variados desparramados arriba/abajo (nunca
// donde va el texto), más un puñado de detalles chicos y sutiles pegados a
// los bordes laterales a media altura, para que el fondo tenga textura sin
// invadir el centro. Cantidad, tipo y posición de todo esto salen al azar
// en cada llamada -- nada queda fijo entre un posteo y el siguiente.
const dibujarVida = (ctx, paleta) => {
  const cantGarabatos = 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < cantGarabatos; i++) {
    const enArriba = i === 0 ? Math.random() < 0.6 : Math.random() < 0.5;
    const x = ANCHO * (0.02 + Math.random() * 0.14);
    const y = enArriba ? ALTO * (0.015 + Math.random() * 0.06) : ALTO * (0.87 + Math.random() * 0.09);
    const ancho = ANCHO * (0.26 + Math.random() * 0.26);
    dibujarGarabato(ctx, x, y, ancho, 55 + Math.random() * 45, paleta.acento, 6 + Math.random() * 3);
  }

  const cantStickers = 8 + Math.floor(Math.random() * 9);
  for (let i = 0; i < cantStickers; i++) {
    const enArriba = Math.random() < 0.5;
    const x = 60 + Math.random() * (ANCHO - 120);
    const y = enArriba ? 20 + Math.random() * (ALTO * 0.16) : ALTO * 0.8 + Math.random() * (ALTO * 0.17);
    const r = 8 + Math.random() * 17;
    elegirSticker()(ctx, x, y, r, paleta.acento);
  }

  const cantLaterales = 2 + Math.floor(Math.random() * 4);
  for (let i = 0; i < cantLaterales; i++) {
    const desdeIzquierda = Math.random() < 0.5;
    const x = desdeIzquierda ? 18 + Math.random() * 34 : ANCHO - 52 + Math.random() * 34;
    const y = ALTO * (0.28 + Math.random() * 0.44);
    const r = 5 + Math.random() * 8;
    ctx.save();
    ctx.globalAlpha = 0.5;
    elegirSticker()(ctx, x, y, r, paleta.acento);
    ctx.restore();
  }
};

// FONDOS: pintan SOLO el fondo -- gradiente/patrón/decoración, llenan todo
// el canvas, nunca dibujan texto. Varios además varían su propia
// decoración al azar cada vez que se llaman (motivo, confeti, "vida") --
// para que ni entre fondos ni dentro del mismo fondo se repita siempre la
// misma cara. El texto es una capa aparte (ver ESTILOS_TEXTO más abajo):
// "cambiar fondo" solo vuelve a elegir de acá, nunca toca cómo se ve el
// texto -- son dos capas independientes, como pidió el cliente ("una
// imagen del fondo y otra del texto, separadas").
const fondoMarco = (ctx, paleta) => {
  ctx.fillStyle = gradienteAzar(ctx, paleta.fondo1, paleta.fondo2);
  ctx.fillRect(0, 0, ANCHO, ALTO);

  ctx.save();
  ctx.strokeStyle = paleta.acento;
  ctx.lineWidth = 5;
  ctx.setLineDash([18, 14]);
  ctx.strokeRect(50, 50, ANCHO - 100, ALTO - 100);
  ctx.restore();

  dibujarVida(ctx, paleta);

  const motivo = Math.floor(Math.random() * 3);
  if (motivo === 0) {
    dibujarArcoiris(ctx, ANCHO / 2, ALTO - 260, 220, 26);
  } else if (motivo === 1) {
    const icono = elegirIcono();
    icono(ctx, 150, 210, 46, paleta.acento);
    icono(ctx, ANCHO - 150, ALTO - 230, 40, paleta.acento);
  } else {
    dibujarConfeti(ctx, ANCHO, ALTO, [paleta.acento, paleta.fondo1], 22, 0.45);
  }

  return { pill: "rgba(255,255,255,0.75)", pillTexto: paleta.texto };
};

const fondoBandas = (ctx, paleta) => {
  ctx.fillStyle = "#FFFBF6";
  ctx.fillRect(0, 0, ANCHO, ALTO);
  dibujarVida(ctx, paleta);
  const icono = elegirIcono();
  icono(ctx, 140, 190, 34, paleta.acento);
  icono(ctx, ANCHO - 150, ALTO - 210, 28, paleta.acento);

  return { pill: paleta.fondo1, pillTexto: paleta.texto };
};

const fondoCielo = (ctx, paleta) => {
  const grad = ctx.createLinearGradient(0, 0, 0, ALTO);
  grad.addColorStop(0, "#DDEEFB");
  grad.addColorStop(1, "#FFFFFF");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, ANCHO, ALTO);

  dibujarVida(ctx, paleta);

  const nube = (x, y, s) => {
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    [[0, 0, 1], [0.5, -0.15, 0.8], [-0.55, -0.1, 0.75], [0.25, 0.15, 0.7], [-0.3, 0.15, 0.65]].forEach(([dx, dy, r]) => {
      ctx.beginPath();
      ctx.ellipse(x + dx * s, y + dy * s, r * s * 0.55, r * s * 0.4, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  };
  nube(190, 260, 190);
  nube(ANCHO - 200, ALTO - 300, 220);
  // Arcoíris chico abajo (no gigante en el medio) -- así no importa qué
  // estilo de texto le toque encima, siempre queda libre el centro.
  dibujarArcoiris(ctx, ANCHO / 2, ALTO * 0.9, 170, 20);

  return { pill: "rgba(255,255,255,0.8)", pillTexto: "#2E3D52" };
};

const fondoBloque = (ctx, paleta) => {
  ctx.fillStyle = gradienteAzar(ctx, paleta.fondo1, paleta.fondo2);
  ctx.fillRect(0, 0, ANCHO, ALTO);

  dibujarVida(ctx, paleta);

  if (Math.random() < 0.5) {
    dibujarBlob(ctx, ANCHO - 120, 160, 110, paleta.acento, 0.3);
    dibujarBlob(ctx, 100, ALTO - 180, 80, paleta.acento, 0.25);
  } else {
    dibujarConfeti(ctx, ANCHO, ALTO, [paleta.acento, paleta.fondo2], 24, 0.4);
  }

  return { pill: "rgba(255,255,255,0.7)", pillTexto: paleta.texto };
};

// Fondo claro con confeti desparramado -- textura suelta, distinta a los
// degradados de los demás.
const fondoSticker = (ctx, paleta) => {
  ctx.fillStyle = "#FFFEFA";
  ctx.fillRect(0, 0, ANCHO, ALTO);
  dibujarConfeti(ctx, ANCHO, ALTO, [paleta.acento, paleta.fondo1, paleta.fondo2], 26, 0.35);
  return { pill: "rgba(0,0,0,0.06)", pillTexto: paleta.texto };
};

// Hoja de cuaderno rayada con margen -- look de apunte escolar.
const fondoCuaderno = (ctx, paleta) => {
  ctx.fillStyle = "#FFFEFA";
  ctx.fillRect(0, 0, ANCHO, ALTO);

  ctx.strokeStyle = paleta.fondo2;
  ctx.lineWidth = 3;
  for (let y = 300; y < ALTO - 140; y += 74) {
    ctx.beginPath();
    ctx.moveTo(70, y);
    ctx.lineTo(ANCHO - 70, y);
    ctx.stroke();
  }
  ctx.strokeStyle = paleta.acento;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(150, 110);
  ctx.lineTo(150, ALTO - 110);
  ctx.stroke();

  dibujarLapiz(ctx, ANCHO - 160, 190, 90, paleta.acento);

  return { pill: "rgba(255,255,255,0.85)", pillTexto: paleta.texto };
};

// Lunares en grilla -- textura prolija y pareja, distinta a los degradados
// y blobs sueltos de los demás fondos.
const fondoPuntos = (ctx, paleta) => {
  ctx.fillStyle = paleta.fondo1;
  ctx.fillRect(0, 0, ANCHO, ALTO);
  const paso = 130;
  let fila = 0;
  for (let y = -40; y < ALTO + 40; y += paso) {
    const offset = fila % 2 === 0 ? 0 : paso / 2;
    for (let x = -40 + offset; x < ANCHO + 40; x += paso) {
      dibujarBlob(ctx, x, y, 22, fila % 2 === 0 ? paleta.acento : paleta.fondo2, 0.55);
    }
    fila++;
  }
  return { pill: "rgba(255,255,255,0.8)", pillTexto: paleta.texto };
};

// Olas horizontales apiladas -- look de paisaje/horizonte, todo en la
// mitad de abajo para dejar libre arriba.
const fondoOndas = (ctx, paleta) => {
  const grad = ctx.createLinearGradient(0, 0, 0, ALTO);
  grad.addColorStop(0, "#FFFFFF");
  grad.addColorStop(1, paleta.fondo1);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, ANCHO, ALTO);

  [
    { y: ALTO * 0.62, color: paleta.fondo2, alpha: 0.55 },
    { y: ALTO * 0.74, color: paleta.acento, alpha: 0.3 },
    { y: ALTO * 0.87, color: paleta.fondo2, alpha: 0.8 },
  ].forEach(({ y, color, alpha }) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, ALTO);
    ctx.lineTo(0, y);
    const pasos = 6;
    for (let i = 0; i <= pasos; i++) {
      const x = (ANCHO / pasos) * i;
      const offsetY = Math.sin(i * 1.3 + y) * 26;
      ctx.quadraticCurveTo(x - ANCHO / pasos / 2, y + offsetY - 20, x, y + offsetY);
    }
    ctx.lineTo(ANCHO, ALTO);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  });

  dibujarVida(ctx, paleta);

  return { pill: "rgba(255,255,255,0.82)", pillTexto: paleta.texto };
};

// Triángulo simple, para las formas sueltas del fondo "Memphis".
const dibujarTriangulo = (ctx, cx, cy, s, color, rot = 0) => {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -s);
  ctx.lineTo(s * 0.87, s * 0.5);
  ctx.lineTo(-s * 0.87, s * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
};

// Trazo en zigzag, otra forma suelta típica del estilo "Memphis".
const dibujarZigzag = (ctx, x, y, ancho, alto, color, grosor = 8, segmentos = 4) => {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = grosor;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  const paso = ancho / segmentos;
  for (let i = 0; i <= segmentos; i++) {
    const px = x + paso * i;
    const py = y + (i % 2 === 0 ? 0 : alto);
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();
  ctx.restore();
};

// Degradado lineal con dirección al azar entre varias diagonales típicas
// -- variedad barata para los fondos que ya usaban siempre la misma
// diagonal fija.
const gradienteAzar = (ctx, colorA, colorB) => {
  const direcciones = [
    [0, 0, ANCHO, ALTO],
    [ANCHO, 0, 0, ALTO],
    [0, 0, ANCHO, 0],
    [0, 0, 0, ALTO],
    [ANCHO, ALTO, 0, 0],
  ];
  const [x0, y0, x1, y1] = direcciones[Math.floor(Math.random() * direcciones.length)];
  const grad = ctx.createLinearGradient(x0, y0, x1, y1);
  grad.addColorStop(0, colorA);
  grad.addColorStop(1, colorB);
  return grad;
};

// Esquina en diagonal de un segundo color -- look "split", moderno.
const fondoDiagonal = (ctx, paleta) => {
  ctx.fillStyle = paleta.fondo1;
  ctx.fillRect(0, 0, ANCHO, ALTO);
  ctx.save();
  if (Math.random() < 0.5) ctx.translate(ANCHO, 0), ctx.scale(-1, 1);
  ctx.fillStyle = paleta.fondo2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(ANCHO, 0);
  ctx.lineTo(0, ALTO * (0.32 + Math.random() * 0.18));
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  dibujarVida(ctx, paleta);
  return { pill: "rgba(255,255,255,0.82)", pillTexto: paleta.texto };
};

// Estallido radial de color desde un punto -- look "foco de luz".
const fondoRadial = (ctx, paleta) => {
  const cx = ANCHO * (0.3 + Math.random() * 0.4);
  const cy = ALTO * (0.22 + Math.random() * 0.16);
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, ANCHO * 0.95);
  grad.addColorStop(0, paleta.fondo2);
  grad.addColorStop(1, paleta.fondo1);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, ANCHO, ALTO);
  dibujarVida(ctx, paleta);
  return { pill: "rgba(255,255,255,0.8)", pillTexto: paleta.texto };
};

// Formas geométricas sueltas por las esquinas, estilo "Memphis" (Ochenta,
// juguetón) -- textura bien distinta a los degradados/blobs orgánicos.
const fondoMemphis = (ctx, paleta) => {
  ctx.fillStyle = "#FFFEFA";
  ctx.fillRect(0, 0, ANCHO, ALTO);

  dibujarTriangulo(ctx, ANCHO * 0.14, ALTO * 0.07, 58, paleta.acento, Math.random() * Math.PI);
  ctx.save();
  ctx.fillStyle = paleta.fondo2;
  ctx.beginPath();
  ctx.arc(ANCHO * 0.86, ALTO * 0.09, 66, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  dibujarZigzag(ctx, ANCHO * 0.1, ALTO * 0.9, ANCHO * 0.28, 26, paleta.acento, 9, 3);
  dibujarTriangulo(ctx, ANCHO * 0.83, ALTO * 0.91, 48, paleta.fondo2, Math.random() * Math.PI);
  ctx.save();
  ctx.strokeStyle = paleta.acento;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.arc(ANCHO * 0.5, ALTO * 0.04, 46, 0, Math.PI);
  ctx.stroke();
  ctx.restore();

  dibujarVida(ctx, paleta);
  return { pill: "rgba(0,0,0,0.05)", pillTexto: paleta.texto };
};

// Franjas diagonales -- look tipo cinta/banderín.
const fondoRayas = (ctx, paleta) => {
  ctx.fillStyle = paleta.fondo1;
  ctx.fillRect(0, 0, ANCHO, ALTO);
  ctx.save();
  ctx.translate(ANCHO / 2, ALTO / 2);
  ctx.rotate((-18 * Math.PI) / 180);
  ctx.translate(-ANCHO / 2, -ALTO / 2);
  ctx.fillStyle = paleta.fondo2;
  const anchoFranja = 70;
  for (let x = -ALTO; x < ANCHO + ALTO; x += anchoFranja * 2) {
    ctx.fillRect(x, -200, anchoFranja, ALTO + 400);
  }
  ctx.restore();
  dibujarVida(ctx, paleta);
  return { pill: "rgba(255,255,255,0.82)", pillTexto: paleta.texto };
};

const FONDOS = [
  fondoMarco, fondoBandas, fondoCielo, fondoBloque, fondoSticker, fondoCuaderno,
  fondoPuntos, fondoOndas, fondoDiagonal, fondoRadial, fondoMemphis, fondoRayas,
];

// ESTILOS_TEXTO: pintan SOLO el texto -- principal/secundario, en una
// posición/alineación/color propios. Funcionan arriba de CUALQUIER fondo
// porque usan paleta.texto (que se mantiene fijo mientras el fondo
// cambie) y, si necesitan más contraste, traen su propio "chip" de fondo
// atrás (banda de color, círculo) en vez de depender del fondo real.
const textoCentrado = (ctx, paleta, principal, secundario, fuentes, colorPrincipal, colorSecundario, offsetP = 0, offsetS = 0, rotP = 0, rotS = 0) => {
  const colorP = colorPrincipal || paleta.texto;
  const colorS = colorSecundario || paleta.texto;
  ctx.textAlign = "center";
  let y = ALTO * 0.3;
  const anclaP = y;
  ctx.save();
  ctx.translate(ANCHO / 2, anclaP + offsetP);
  ctx.rotate((rotP * Math.PI) / 180);
  ctx.translate(-ANCHO / 2, -anclaP);
  ctx.font = fontTitulo(fuentes, 80);
  ctx.fillStyle = colorP;
  envolverTexto(ctx, principal, ANCHO * 0.82).slice(0, 4).forEach((l) => { ctx.fillText(l, ANCHO / 2, y); y += 92; });
  ctx.restore();
  y += 14;
  const anclaS = y;
  ctx.save();
  ctx.translate(ANCHO / 2, anclaS + offsetS);
  ctx.rotate((rotS * Math.PI) / 180);
  ctx.translate(-ANCHO / 2, -anclaS);
  ctx.font = fontTexto(fuentes, 42);
  ctx.fillStyle = colorS;
  envolverTexto(ctx, secundario, ANCHO * 0.8).slice(0, 3).forEach((l) => { ctx.fillText(l, ANCHO / 2, y); y += 54; });
  ctx.restore();
  return { principal: anclaP, secundario: anclaS };
};

const textoBanda = (ctx, paleta, principal, secundario, fuentes, colorPrincipal, colorSecundario, offsetP = 0, offsetS = 0, rotP = 0, rotS = 0) => {
  const colorP = colorPrincipal || paleta.texto;
  const colorS = colorSecundario || paleta.texto;
  ctx.save();
  ctx.translate(ANCHO / 2, ALTO * 0.42 + offsetP);
  ctx.rotate(((-4 + rotP) * Math.PI) / 180);
  ctx.textAlign = "center";
  ctx.font = fontTitulo(fuentes, 84);
  const lineasP = envolverTexto(ctx, principal, ANCHO * 0.72).slice(0, 3);
  const altoBanda = lineasP.length * 96 + 44;
  ctx.fillStyle = paleta.fondo2;
  ctx.fillRect(-ANCHO * 0.44, -altoBanda / 2, ANCHO * 0.88, altoBanda);
  ctx.fillStyle = colorP;
  let yb = -altoBanda / 2 + 72;
  lineasP.forEach((l) => { ctx.fillText(l, 0, yb); yb += 96; });
  ctx.restore();

  const anclaS = ALTO * 0.42 + (lineasP.length * 96) / 2 + 100;
  ctx.save();
  ctx.translate(ANCHO / 2, anclaS + offsetS);
  ctx.rotate((rotS * Math.PI) / 180);
  ctx.translate(-ANCHO / 2, -anclaS);
  ctx.textAlign = "center";
  ctx.font = fontTexto(fuentes, 44);
  ctx.fillStyle = colorS;
  let y2 = anclaS;
  envolverTexto(ctx, secundario, ANCHO * 0.76).slice(0, 3).forEach((l) => { ctx.fillText(l, ANCHO / 2, y2); y2 += 56; });
  ctx.restore();
  return { principal: ALTO * 0.42, secundario: anclaS };
};

const textoIzquierda = (ctx, paleta, principal, secundario, fuentes, colorPrincipal, colorSecundario, offsetP = 0, offsetS = 0, rotP = 0, rotS = 0) => {
  const colorP = colorPrincipal || paleta.texto;
  const colorS = colorSecundario || paleta.texto;
  ctx.textAlign = "left";
  const xIzq = 90;
  let y = ALTO * 0.38;
  const anclaP = y;
  ctx.save();
  ctx.translate(xIzq, anclaP + offsetP);
  ctx.rotate((rotP * Math.PI) / 180);
  ctx.translate(-xIzq, -anclaP);
  ctx.font = fontTitulo(fuentes, 84);
  ctx.fillStyle = colorP;
  envolverTexto(ctx, principal, ANCHO * 0.76).slice(0, 4).forEach((l) => { ctx.fillText(l, xIzq, y); y += 96; });
  ctx.restore();
  y += 18;
  const anclaS = y;
  ctx.save();
  ctx.translate(xIzq, anclaS + offsetS);
  ctx.rotate((rotS * Math.PI) / 180);
  ctx.translate(-xIzq, -anclaS);
  ctx.font = fontTexto(fuentes, 42);
  ctx.fillStyle = colorS;
  envolverTexto(ctx, secundario, ANCHO * 0.74).slice(0, 3).forEach((l) => { ctx.fillText(l, xIzq, y); y += 54; });
  ctx.restore();
  return { principal: anclaP, secundario: anclaS };
};

// Insignia circular con el texto adentro -- trae su propio círculo de
// fondo (paleta.fondo1 + borde acento), así que el desplazamiento del
// principal mueve el círculo Y el texto juntos (separarlos se vería raro,
// el texto quedaría descentrado de su propio círculo).
const textoInsignia = (ctx, paleta, principal, secundario, fuentes, colorPrincipal, colorSecundario, offsetP = 0, offsetS = 0, rotP = 0, rotS = 0) => {
  const colorP = colorPrincipal || paleta.texto;
  const colorS = colorSecundario || paleta.texto;
  const cx = ANCHO / 2;
  const cy = ALTO * 0.42;
  const r = ANCHO * 0.42;

  ctx.save();
  ctx.translate(cx, cy + offsetP);
  ctx.rotate((rotP * Math.PI) / 180);
  ctx.translate(-cx, -cy);
  ctx.save();
  ctx.fillStyle = paleta.fondo1;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 9;
  ctx.strokeStyle = paleta.acento;
  ctx.stroke();
  ctx.restore();

  ctx.textAlign = "center";
  ctx.font = fontTitulo(fuentes, 68);
  ctx.fillStyle = colorP;
  const lineas = envolverTexto(ctx, principal, r * 1.5).slice(0, 3);
  let y = cy - ((lineas.length - 1) * 44);
  lineas.forEach((l) => { ctx.fillText(l, cx, y); y += 88; });
  ctx.restore();

  const anclaS = cy + r + 100;
  ctx.save();
  ctx.translate(ANCHO / 2, anclaS + offsetS);
  ctx.rotate((rotS * Math.PI) / 180);
  ctx.translate(-ANCHO / 2, -anclaS);
  ctx.font = fontTexto(fuentes, 40);
  ctx.fillStyle = colorS;
  let y2 = anclaS;
  envolverTexto(ctx, secundario, ANCHO * 0.78).slice(0, 3).forEach((l) => { ctx.fillText(l, ANCHO / 2, y2); y2 += 52; });
  ctx.restore();
  return { principal: cy, secundario: anclaS };
};

// Título con una leve inclinación, alineado a la izquierda -- toque
// "escrito a mano", dinámico.
const textoInclinado = (ctx, paleta, principal, secundario, fuentes, colorPrincipal, colorSecundario, offsetP = 0, offsetS = 0, rotP = 0, rotS = 0) => {
  const colorP = colorPrincipal || paleta.texto;
  const colorS = colorSecundario || paleta.texto;
  ctx.save();
  ctx.translate(ANCHO * 0.12, ALTO * 0.36 + offsetP);
  ctx.rotate(((-2.5 + rotP) * Math.PI) / 180);
  ctx.textAlign = "left";
  ctx.font = fontTitulo(fuentes, 78);
  ctx.fillStyle = colorP;
  let y = 0;
  envolverTexto(ctx, principal, ANCHO * 0.72).slice(0, 4).forEach((l) => { ctx.fillText(l, 0, y); y += 90; });
  ctx.restore();

  const anclaS = ALTO * 0.36 + 46;
  const pivotXS = ANCHO * 0.12;
  ctx.save();
  ctx.translate(pivotXS, anclaS + offsetS);
  ctx.rotate((rotS * Math.PI) / 180);
  ctx.translate(-pivotXS, -anclaS);
  ctx.textAlign = "left";
  ctx.font = fontTexto(fuentes, 40);
  ctx.fillStyle = colorS;
  let y2 = anclaS;
  envolverTexto(ctx, secundario, ANCHO * 0.7).slice(0, 3).forEach((l) => { ctx.fillText(l, ANCHO * 0.12, y2); y2 += 52; });
  ctx.restore();
  return { principal: ALTO * 0.36, secundario: anclaS };
};

// Título grande apilado, bien centrado -- estilo "portada de historia".
const textoApilado = (ctx, paleta, principal, secundario, fuentes, colorPrincipal, colorSecundario, offsetP = 0, offsetS = 0, rotP = 0, rotS = 0) => {
  const colorP = colorPrincipal || paleta.texto;
  const colorS = colorSecundario || paleta.texto;
  ctx.textAlign = "center";
  ctx.font = fontTitulo(fuentes, 96);
  const lineas = envolverTexto(ctx, principal, ANCHO * 0.86).slice(0, 4);
  let y = ALTO * 0.46 - (lineas.length - 1) * 50;
  const anclaP = y;
  ctx.save();
  ctx.translate(ANCHO / 2, anclaP + offsetP);
  ctx.rotate((rotP * Math.PI) / 180);
  ctx.translate(-ANCHO / 2, -anclaP);
  ctx.fillStyle = colorP;
  lineas.forEach((l) => { ctx.fillText(l, ANCHO / 2, y); y += 100; });
  ctx.restore();

  const anclaS = y + 26;
  ctx.save();
  ctx.translate(ANCHO / 2, anclaS + offsetS);
  ctx.rotate((rotS * Math.PI) / 180);
  ctx.translate(-ANCHO / 2, -anclaS);
  ctx.font = fontTexto(fuentes, 38);
  ctx.fillStyle = colorS;
  let y2 = anclaS;
  envolverTexto(ctx, secundario, ANCHO * 0.78).slice(0, 3).forEach((l) => { ctx.fillText(l, ANCHO / 2, y2); y2 += 48; });
  ctx.restore();
  return { principal: anclaP, secundario: anclaS };
};

// Texto chico abajo, con mucho espacio libre arriba -- composición
// minimalista, bien distinta a las demás (que ocupan más el centro).
const textoMinimal = (ctx, paleta, principal, secundario, fuentes, colorPrincipal, colorSecundario, offsetP = 0, offsetS = 0, rotP = 0, rotS = 0) => {
  const colorP = colorPrincipal || paleta.texto;
  const colorS = colorSecundario || paleta.texto;
  ctx.textAlign = "center";
  ctx.font = fontTitulo(fuentes, 60);
  let y = ALTO * 0.72;
  const anclaP = y;
  ctx.save();
  ctx.translate(ANCHO / 2, anclaP + offsetP);
  ctx.rotate((rotP * Math.PI) / 180);
  ctx.translate(-ANCHO / 2, -anclaP);
  ctx.fillStyle = colorP;
  envolverTexto(ctx, principal, ANCHO * 0.7).slice(0, 3).forEach((l) => { ctx.fillText(l, ANCHO / 2, y); y += 68; });
  ctx.restore();
  y += 10;
  const anclaS = y;
  ctx.save();
  ctx.translate(ANCHO / 2, anclaS + offsetS);
  ctx.rotate((rotS * Math.PI) / 180);
  ctx.translate(-ANCHO / 2, -anclaS);
  ctx.fillStyle = colorS;
  ctx.font = fontTexto(fuentes, 34);
  envolverTexto(ctx, secundario, ANCHO * 0.66).slice(0, 2).forEach((l) => { ctx.fillText(l, ANCHO / 2, y); y += 44; });
  ctx.restore();
  return { principal: anclaP, secundario: anclaS };
};

const ESTILOS_TEXTO = [textoCentrado, textoBanda, textoIzquierda, textoInsignia, textoInclinado, textoApilado, textoMinimal];

// Sombra pareja para que el texto blanco se lea encima de CUALQUIER zona
// de la foto (clara u oscura) -- la usan todas las variantes de abajo.
const conSombraFoto = (ctx, dibujar) => {
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 3;
  dibujar();
  ctx.restore();
};

// Envuelve texto, pero si con el tamaño pedido no entra en `maxLineas`
// líneas, va achicando la letra hasta que sí entre (con un piso, para que
// no quede microscópico) -- en vez de cortar en seco con `.slice(N)`,
// que perdía palabras del final SIN avisar cuando la IA mandaba un texto
// más largo de lo esperado (se notó feo en textos tipo "MARTES": un
// título de 8 palabras a font gigante terminaba mostrando 2). Devuelve
// las líneas ya armadas y el tamaño final -- dejar el font puesto en el
// ctx para que quien llama solo tenga que dibujar.
const envolverAjustado = (ctx, texto, maxAncho, maxLineas, tamanoInicial, fontFn, fuentesFoto, tamanoPiso) => {
  const piso = tamanoPiso || Math.round(tamanoInicial * 0.55);
  let tamano = tamanoInicial;
  let lineas;
  do {
    ctx.font = fontFn(fuentesFoto, tamano);
    lineas = envolverTexto(ctx, texto, maxAncho);
    if (lineas.length <= maxLineas || tamano <= piso) break;
    tamano -= 4;
  } while (true);
  ctx.font = fontFn(fuentesFoto, tamano);
  return { lineas: lineas.slice(0, maxLineas), tamano };
};

// Variantes de CÓMO se pone el texto sobre la foto -- antes había una
// sola forma fija (siempre centrado, título arriba + secundario abajo con
// óvalo), así que a pesar de tener 12 búsquedas distintas de foto, todos
// los posteos se veían "iguales" en la parte que más se nota (el texto).
// Cada función acá SOLO dibuja texto (la foto + velo + sparkle van
// aparte, en dibujarFondoFotoReal) -- mismo patrón que ESTILOS_TEXTO para
// los fondos ilustrados.

// A) Centrado clásico: principal grande arriba, secundario en itálica/
// manuscrita abajo con un óvalo (si es corto) o un subrayado ondulado (si
// es más largo) marcándolo -- el que se ve en la referencia "versión".
const fotoCentrado = (ctx, principal, secundario, fuentesFoto, acento, colorPrincipal, colorSecundario, offsetP = 0, offsetS = 0, rotP = 0, rotS = 0) => {
  ctx.textAlign = "center";
  let y = ALTO * 0.36;
  const anclaP = y;
  ctx.save();
  ctx.translate(ANCHO / 2, anclaP + offsetP);
  ctx.rotate((rotP * Math.PI) / 180);
  ctx.translate(-ANCHO / 2, -anclaP);
  ctx.fillStyle = colorPrincipal || "#FFFFFF";
  const { lineas: lineasP, tamano: tamP } = envolverAjustado(ctx, principal, ANCHO * 0.82, 3, 96, fontTituloFoto, fuentesFoto);
  conSombraFoto(ctx, () => {
    ctx.font = fontTituloFoto(fuentesFoto, tamP);
    lineasP.forEach((l) => { ctx.fillText(l, ANCHO / 2, y); y += tamP * 1.08; });
  });
  ctx.restore();

  y += 34;
  const yInicioSecundario0 = y;
  ctx.save();
  ctx.translate(ANCHO / 2, yInicioSecundario0 + offsetS);
  ctx.rotate((rotS * Math.PI) / 180);
  ctx.translate(-ANCHO / 2, -yInicioSecundario0);
  ctx.fillStyle = colorSecundario || "#FFFFFF";
  const yInicioSecundario = y;
  let anchoMaxLinea = 0;
  const { lineas: lineasSec, tamano: tamS } = envolverAjustado(ctx, secundario, ANCHO * 0.78, 3, 58, fontScript, fuentesFoto);
  conSombraFoto(ctx, () => {
    ctx.font = fontScript(fuentesFoto, tamS);
    lineasSec.forEach((l) => {
      ctx.fillText(l, ANCHO / 2, y);
      anchoMaxLinea = Math.max(anchoMaxLinea, ctx.measureText(l).width);
      y += tamS * 1.14;
    });
  });

  if (lineasSec.length === 1 && anchoMaxLinea < ANCHO * 0.55) {
    dibujarOvaloAcento(ctx, ANCHO / 2, yInicioSecundario - 18, anchoMaxLinea / 2 + 36, 46, acento, 6);
  } else if (anchoMaxLinea > 0) {
    dibujarOnda(ctx, ANCHO / 2 - anchoMaxLinea / 2 - 10, y - tamS * 0.7, anchoMaxLinea + 20, 8, acento, 5);
  }
  ctx.restore();
  return { principal: anclaP, secundario: yInicioSecundario };
};

// B) Volanta chica + palabra gigante: secundario chico en itálica/script
// arriba, principal EN MAYÚSCULAS gigante abajo -- calcado de las
// referencias tipo "¡Nuevo día! MARTES" / "Bienvenido LUNES", sin ningún
// acento extra (esas cuentas las dejan bien limpias, sin óvalo ni línea).
const fotoVolantaGrande = (ctx, principal, secundario, fuentesFoto, _acento, colorPrincipal, colorSecundario, offsetP = 0, offsetS = 0, rotP = 0, rotS = 0) => {
  ctx.textAlign = "center";
  let y = ALTO * 0.3;
  const anclaS = y;
  ctx.save();
  ctx.translate(ANCHO / 2, anclaS + offsetS);
  ctx.rotate((rotS * Math.PI) / 180);
  ctx.translate(-ANCHO / 2, -anclaS);
  ctx.fillStyle = colorSecundario || "#FFFFFF";
  const { lineas: lineasSec, tamano: tamS } = envolverAjustado(ctx, secundario, ANCHO * 0.7, 2, 46, fontScript, fuentesFoto);
  conSombraFoto(ctx, () => {
    ctx.font = fontScript(fuentesFoto, tamS);
    lineasSec.forEach((l) => { ctx.fillText(l, ANCHO / 2, y); y += tamS * 1.13; });
  });
  ctx.restore();

  y += 46;
  const anclaP = y;
  ctx.save();
  ctx.translate(ANCHO / 2, anclaP + offsetP);
  ctx.rotate((rotP * Math.PI) / 180);
  ctx.translate(-ANCHO / 2, -anclaP);
  ctx.fillStyle = colorPrincipal || "#FFFFFF";
  // Piso más bajo que el resto y hasta 3 líneas -- este es el layout con
  // la letra más grande de todas (116px), así que es el que más necesita
  // margen para achicarse antes que perder palabras.
  const { lineas: lineasP, tamano: tamP } = envolverAjustado(ctx, principal.toUpperCase(), ANCHO * 0.88, 3, 116, fontTituloFoto, fuentesFoto, 48);
  conSombraFoto(ctx, () => {
    ctx.font = fontTituloFoto(fuentesFoto, tamP);
    lineasP.forEach((l) => { ctx.fillText(l, ANCHO / 2, y); y += tamP * 1.04; });
  });
  ctx.restore();
  return { principal: anclaP, secundario: anclaS };
};

// C) Insignia arriba + frase grande abajo: principal como una placa/pill
// chica (mayúsculas, achica sola la letra si el texto es más largo de lo
// que entra), secundario grande en itálica/manuscrita debajo -- calcado
// de la referencia "FRASE DEL DÍA" + cita.
const fotoInsigniaFoto = (ctx, principal, secundario, fuentesFoto, acento, colorPrincipal, colorSecundario, offsetP = 0, offsetS = 0, rotP = 0, rotS = 0) => {
  ctx.textAlign = "center";
  // El principal viaja como una placa/pill entera (fondo + texto): separar
  // el texto de su propio fondo se vería roto, así que el desplazamiento
  // (y el giro) mueve la placa completa.
  const yBadgeAncla = ALTO * 0.4;
  ctx.save();
  ctx.translate(ANCHO / 2, yBadgeAncla + offsetP);
  ctx.rotate((rotP * Math.PI) / 180);
  ctx.translate(-ANCHO / 2, -yBadgeAncla);
  const textoBadge = principal.toUpperCase();
  let tamanoBadge = 30;
  ctx.font = `700 ${tamanoBadge}px 'Manrope', sans-serif`;
  const anchoMaxBadge = ANCHO * 0.8;
  while (ctx.measureText(textoBadge).width > anchoMaxBadge && tamanoBadge > 16) {
    tamanoBadge -= 2;
    ctx.font = `700 ${tamanoBadge}px 'Manrope', sans-serif`;
  }
  const anchoBadge = ctx.measureText(textoBadge).width;
  const yBadge = ALTO * 0.4;
  ctx.fillStyle = acento;
  ctx.beginPath();
  ctx.roundRect(ANCHO / 2 - anchoBadge / 2 - 30, yBadge - 42, anchoBadge + 60, 62, 31);
  ctx.fill();
  ctx.fillStyle = "#2B2530";
  ctx.fillText(textoBadge, ANCHO / 2, yBadge);
  ctx.restore();

  let y = ALTO * 0.4 + 96;
  const anclaS = y;
  ctx.save();
  ctx.translate(ANCHO / 2, anclaS + offsetS);
  ctx.rotate((rotS * Math.PI) / 180);
  ctx.translate(-ANCHO / 2, -anclaS);
  ctx.fillStyle = colorSecundario || "#FFFFFF";
  const { lineas: lineasSec, tamano: tamS } = envolverAjustado(ctx, secundario, ANCHO * 0.78, 4, 60, fontScript, fuentesFoto);
  conSombraFoto(ctx, () => {
    ctx.font = fontScript(fuentesFoto, tamS);
    lineasSec.forEach((l) => { ctx.fillText(l, ANCHO / 2, y); y += tamS * 1.13; });
  });
  ctx.restore();
  return { principal: ALTO * 0.4, secundario: anclaS };
};

// D) Alineado a la izquierda: mismo par grande + elegante que el centrado,
// pero pegado al margen izquierdo con un subrayado ondulado -- rompe la
// simetría de las otras tres variantes.
const fotoIzquierdaFoto = (ctx, principal, secundario, fuentesFoto, acento, colorPrincipal, colorSecundario, offsetP = 0, offsetS = 0, rotP = 0, rotS = 0) => {
  ctx.textAlign = "left";
  const x = ANCHO * 0.1;
  let y = ALTO * 0.34;
  const anclaP = y;
  ctx.save();
  ctx.translate(x, anclaP + offsetP);
  ctx.rotate((rotP * Math.PI) / 180);
  ctx.translate(-x, -anclaP);
  ctx.fillStyle = colorPrincipal || "#FFFFFF";
  const { lineas: lineasP, tamano: tamP } = envolverAjustado(ctx, principal, ANCHO * 0.76, 3, 84, fontTituloFoto, fuentesFoto);
  conSombraFoto(ctx, () => {
    ctx.font = fontTituloFoto(fuentesFoto, tamP);
    lineasP.forEach((l) => { ctx.fillText(l, x, y); y += tamP * 1.1; });
  });
  ctx.restore();

  y += 30;
  const anclaS = y;
  ctx.save();
  ctx.translate(x, anclaS + offsetS);
  ctx.rotate((rotS * Math.PI) / 180);
  ctx.translate(-x, -anclaS);
  ctx.fillStyle = colorSecundario || "#FFFFFF";
  const { lineas: lineasSec, tamano: tamS } = envolverAjustado(ctx, secundario, ANCHO * 0.7, 3, 50, fontScript, fuentesFoto);
  let anchoMaxLinea = 0;
  conSombraFoto(ctx, () => {
    ctx.font = fontScript(fuentesFoto, tamS);
    lineasSec.forEach((l) => {
      ctx.fillText(l, x, y);
      anchoMaxLinea = Math.max(anchoMaxLinea, ctx.measureText(l).width);
      y += tamS * 1.16;
    });
  });
  if (anchoMaxLinea > 0) dibujarOnda(ctx, x - 6, y - tamS * 0.68, anchoMaxLinea + 16, 7, acento, 5);
  ctx.restore();
  return { principal: anclaP, secundario: anclaS };
};

// E) Todo abajo, minimalista: mucho espacio libre arriba (para que se vea
// más la foto), texto más chico junto al piso -- composición bien
// distinta a las otras cuatro, que ocupan el centro.
const fotoAbajoMinimal = (ctx, principal, secundario, fuentesFoto, _acento, colorPrincipal, colorSecundario, offsetP = 0, offsetS = 0, rotP = 0, rotS = 0) => {
  ctx.textAlign = "center";
  let y = ALTO * 0.74;
  const anclaP = y;
  ctx.save();
  ctx.translate(ANCHO / 2, anclaP + offsetP);
  ctx.rotate((rotP * Math.PI) / 180);
  ctx.translate(-ANCHO / 2, -anclaP);
  ctx.fillStyle = colorPrincipal || "#FFFFFF";
  const { lineas: lineasP, tamano: tamP } = envolverAjustado(ctx, principal, ANCHO * 0.8, 2, 72, fontTituloFoto, fuentesFoto);
  conSombraFoto(ctx, () => {
    ctx.font = fontTituloFoto(fuentesFoto, tamP);
    lineasP.forEach((l) => { ctx.fillText(l, ANCHO / 2, y); y += tamP * 1.08; });
  });
  ctx.restore();
  y += 20;
  const anclaS = y;
  ctx.save();
  ctx.translate(ANCHO / 2, anclaS + offsetS);
  ctx.rotate((rotS * Math.PI) / 180);
  ctx.translate(-ANCHO / 2, -anclaS);
  ctx.fillStyle = colorSecundario || "#FFFFFF";
  const { lineas: lineasSec, tamano: tamS } = envolverAjustado(ctx, secundario, ANCHO * 0.72, 2, 42, fontScript, fuentesFoto);
  conSombraFoto(ctx, () => {
    ctx.font = fontScript(fuentesFoto, tamS);
    lineasSec.forEach((l) => { ctx.fillText(l, ANCHO / 2, y); y += tamS * 1.19; });
  });
  ctx.restore();
  return { principal: anclaP, secundario: anclaS };
};

const ESTILOS_TEXTO_FOTO = [fotoCentrado, fotoVolantaGrande, fotoInsigniaFoto, fotoIzquierdaFoto, fotoAbajoMinimal];

// Solo la "base" de foto real (foto + velo oscuro + sparkle), sin texto --
// separado del texto para poder cachearlo (ver fondoCache en
// componerImagenPost): mientras se arrastra un texto sobre una foto real,
// no hace falta volver a cargar/dibujar la foto en cada frame, solo mover
// el texto.
const dibujarFondoFotoReal = (ctx, img) => {
  // Foto nítida, sin difuminar -- la clienta pidió sacar el efecto de
  // blur y dejar la foto tal cual, apoyándose solo en una capa
  // semitransparente encima (el "velo") para que el texto blanco siga
  // leyéndose bien sin importar cuán clara sea la foto que tocó.
  dibujarCover(ctx, img, 0, 0, ANCHO, ALTO);

  const velo = ctx.createLinearGradient(0, 0, 0, ALTO);
  velo.addColorStop(0, "rgba(20,15,20,0.4)");
  velo.addColorStop(0.55, "rgba(20,15,20,0.28)");
  velo.addColorStop(1, "rgba(15,10,15,0.62)");
  ctx.fillStyle = velo;
  ctx.fillRect(0, 0, ANCHO, ALTO);

  dibujarEstrella(ctx, ANCHO * (0.14 + Math.random() * 0.1), ALTO * (0.09 + Math.random() * 0.05), 26, "rgba(255,255,255,0.92)");
};

// Elige UN índice al azar de un pool de tamaño `total`, evitando los que
// estén en `evitar` si es posible -- se usa tanto para el fondo como para
// el estilo de texto, cada uno con su propio pool.
const elegirIdx = (total, evitar = []) => {
  const evitarSet = new Set(evitar);
  const disponibles = Array.from({ length: total }, (_, i) => i).filter((i) => !evitarSet.has(i));
  const pool = disponibles.length > 0 ? disponibles : Array.from({ length: total }, (_, i) => i);
  return pool[Math.floor(Math.random() * pool.length)];
};

// Sortea `cantidad` índices de fondo DISTINTOS entre sí (no simplemente
// 0,1,2...) -- para que las tarjetas visibles a la vez usen fondos
// distintos entre sí.
const elegirIndicesFondo = (cantidad) => {
  const indices = Array.from({ length: FONDOS.length }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.slice(0, cantidad);
};

// Arma la imagen final del posteo: un fondo pastel propio (o la foto que
// se haya subido a mano) + el texto corto superpuesto como una capa
// aparte, más una marca de agua chica con el handle abajo. `fondoIdx`,
// `estiloIdx`, `paleta` y `fuentes` ya vienen elegidos desde afuera
// (procesarPost) -- así se puede mantener el texto (posición, color,
// letra) exactamente igual mientras solo se cambia el fondo, o al revés.
const componerImagenPost = async (imagenUrl, principal, secundario, fondoIdx = 0, estiloIdx = 0, paleta, fuentes, tipoFondo = "ilustrado", fotoFondoReal = null, estiloFotoIdx = 0, colorPrincipal = null, colorSecundario = null, offsetP = 0, offsetS = 0, semilla = 1, rotP = 0, rotS = 0) => {
  try {
    // "document.fonts.ready" solo espera las fuentes que el navegador ya
    // haya empezado a cargar -- si a una tipografía del sorteo todavía no
    // le tocó usarse en ningún texto de la página, puede no haber arrancado
    // a bajarse todavía. Pedimos explícito que cargue justo las 2 que se
    // van a usar en ESTA imagen, para no dibujar con la fuente de reemplazo
    // por llegar tarde. (El estilo "foto real" puede pedir la itálica de la
    // secundaria -- "italic" adelante del shorthand asegura que cargue esa
    // variante puntual, no la redonda.)
    const prefijoItalica = fuentes.texto.italica ? "italic " : "";
    await Promise.all([
      document.fonts.load(`${fuentes.titulo.peso} 80px '${fuentes.titulo.familia}'`),
      document.fonts.load(`${prefijoItalica}${fuentes.texto.peso} 40px '${fuentes.texto.familia}'`),
      document.fonts.ready,
    ]);

    const canvas = document.createElement("canvas");
    canvas.width = ANCHO * ESCALA_EXPORT;
    canvas.height = ALTO * ESCALA_EXPORT;
    const ctx = canvas.getContext("2d");
    ctx.scale(ESCALA_EXPORT, ESCALA_EXPORT);

    let colorPill = "rgba(0,0,0,0.4)";
    let colorTextoPill = "#FFFFFF";
    // Centro vertical (en px lógicos, sin contar offsetP/offsetS) de cada
    // bloque de texto en lo que se acaba de dibujar -- lo llena cada rama
    // de abajo con la posición real que usó, para que el arrastre sepa a
    // qué bloque se acercó el clic en vez de adivinar con la mitad de la
    // imagen. En la rama de foto subida a mano no se usa (el arrastre está
    // deshabilitado ahí), así que se deja un valor genérico.
    let centros = { principal: ALTO * 0.15, secundario: ALTO * 0.87 };

    if (imagenUrl) {
      // Foto real subida a mano: se muestra COMPLETA (sin recortarla a la
      // fuerza a 9:16, que perdía partes de la foto) sobre un fondo
      // ambiental hecho con la misma foto desenfocada. El texto ya NO va en
      // un velo oscuro arriba de la foto -- va en su propia tarjeta blanca,
      // igual de legible sin importar los colores de la foto de fondo.
      const img = await cargarImagen(imagenUrl);

      ctx.save();
      ctx.filter = "blur(50px) brightness(0.92)";
      dibujarCover(ctx, img, -60, -60, ANCHO + 120, ALTO + 120);
      ctx.restore();

      const margenFoto = 64;
      const areaY = ALTO * 0.26;
      const areaH = ALTO * 0.5;
      const escalaFoto = Math.min((ANCHO - margenFoto * 2) / img.width, areaH / img.height);
      const wFoto = img.width * escalaFoto;
      const hFoto = img.height * escalaFoto;
      const xFoto = (ANCHO - wFoto) / 2;
      const yFoto = areaY + (areaH - hFoto) / 2;

      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.95)";
      ctx.shadowColor = "rgba(0,0,0,0.3)";
      ctx.shadowBlur = 36;
      ctx.beginPath();
      ctx.roundRect(xFoto - 14, yFoto - 14, wFoto + 28, hFoto + 28, 20);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.roundRect(xFoto, yFoto, wFoto, hFoto, 12);
      ctx.clip();
      ctx.drawImage(img, xFoto, yFoto, wFoto, hFoto);
      ctx.restore();

      ctx.textAlign = "center";
      if (principal) {
        ctx.font = fontTitulo(fuentes, 70);
        const lineasP = envolverTexto(ctx, principal, ANCHO * 0.8).slice(0, 3);
        const altoBanda = lineasP.length * 78 + 48;
        const bandaY = ALTO * 0.06;
        ctx.fillStyle = "rgba(255,255,255,0.92)";
        ctx.beginPath();
        ctx.roundRect(ANCHO * 0.07, bandaY, ANCHO * 0.86, altoBanda, 26);
        ctx.fill();
        ctx.fillStyle = "#2B2530";
        let ty = bandaY + 62;
        lineasP.forEach((l) => { ctx.fillText(l, ANCHO / 2, ty); ty += 78; });
      }
      if (secundario) {
        ctx.font = fontTexto(fuentes, 36);
        ctx.fillStyle = "#FFFFFF";
        ctx.shadowColor = "rgba(0,0,0,0.45)";
        ctx.shadowBlur = 10;
        let ty2 = ALTO * 0.87;
        envolverTexto(ctx, secundario, ANCHO * 0.78).slice(0, 3).forEach((l) => { ctx.fillText(l, ANCHO / 2, ty2); ty2 += 46; });
        ctx.shadowBlur = 0;
      }
    } else if (tipoFondo === "foto_real" && fotoFondoReal?.url) {
      // Foto real traída sola (no subida a mano) de un banco de fotos --
      // el texto va DIRECTO sobre la foto (sin tarjeta blanca), calcado
      // del estilo real que pidió el cliente. La foto+velo+sparkle salen
      // del cache (ver arriba) -- no hace falta recargar/redibujar la
      // foto en cada recomposición, solo cuando cambia la foto o la
      // semilla (que fija dónde cae el sparkle).
      const claveFondo = `foto:${fotoFondoReal.url}:${semilla}`;
      const { canvas: fondoCacheado } = await obtenerFondoCacheado(claveFondo, async (ctxFondo) => {
        const img = await cargarImagen(fotoFondoReal.url);
        dibujarConSemilla(semilla, () => dibujarFondoFotoReal(ctxFondo, img));
      });
      ctx.drawImage(fondoCacheado, 0, 0, ANCHO, ALTO);
      const acento = "#F0AFC8";
      const variante = ESTILOS_TEXTO_FOTO[estiloFotoIdx % ESTILOS_TEXTO_FOTO.length];
      centros = dibujarConSemilla(semilla, () => variante(ctx, principal || "", secundario || "", fuentes, acento, colorPrincipal, colorSecundario, offsetP, offsetS, rotP, rotS));
      colorPill = "rgba(0,0,0,0.42)";
      colorTextoPill = "#FFFFFF";
    } else {
      // Sin foto: fondo y texto son dos capas separadas -- primero se
      // pinta el fondo entero, después el texto encima, cada uno con su
      // propio índice (así "cambiar fondo" puede tocar uno sin tocar el
      // otro). El fondo (con sus blobs/garabatos/stickers, lo más pesado
      // de dibujar) sale del cache -- solo se redibuja de verdad la
      // primera vez que se ve esta combinación de fondo+semilla.
      const claveFondo = `ilustrado:${fondoIdx}:${semilla}:${paleta.fondo1}:${paleta.fondo2}:${paleta.acento}:${paleta.texto}`;
      const { canvas: fondoCacheado, extra: pillInfo } = await obtenerFondoCacheado(claveFondo, (ctxFondo) => {
        const fondo = FONDOS[fondoIdx % FONDOS.length];
        return dibujarConSemilla(semilla, () => fondo(ctxFondo, paleta));
      });
      ctx.drawImage(fondoCacheado, 0, 0, ANCHO, ALTO);
      colorPill = pillInfo.pill;
      colorTextoPill = pillInfo.pillTexto;
      const estilo = ESTILOS_TEXTO[estiloIdx % ESTILOS_TEXTO.length];
      centros = estilo(ctx, paleta, principal || "", secundario || "", fuentes, colorPrincipal, colorSecundario, offsetP, offsetS, rotP, rotS);
    }

    // Marca de agua abajo, calcada del estilo de la firma del footer de la
    // web (logo + "Psicope.cba" en negrita + separador + "Lic. Brenda
    // Grossi" más tenue) -- antes era solo el texto "Psicope.cba" solo,
    // que quedaba muy sutil.
    ctx.save();
    const logo = await cargarLogoMarca();
    const logoH = 38;
    const logoW = logo.width * (logoH / logo.height);
    const fontMarca = "700 30px 'Plus Jakarta Sans', sans-serif";
    const fontSep = "300 26px 'Manrope', sans-serif";
    const fontTag = "400 26px 'Manrope', sans-serif";

    ctx.font = fontMarca;
    const wMarca = ctx.measureText("Psicope.cba").width;
    ctx.font = fontSep;
    const wSep = ctx.measureText("|").width;
    ctx.font = fontTag;
    const wTag = ctx.measureText("Lic. Brenda Grossi").width;

    const gap = 14;
    const padX = 26;
    const pillH = 64;
    const pillW = logoW + gap + wMarca + gap + wSep + gap + wTag + padX * 2;
    const pillX = 40;
    const pillY = ALTO - 118;
    const centerY = pillY + pillH / 2;

    ctx.fillStyle = colorPill;
    ctx.beginPath();
    ctx.roundRect(pillX, pillY, pillW, pillH, pillH / 2);
    ctx.fill();

    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    let cursorX = pillX + padX;
    ctx.drawImage(logo, cursorX, centerY - logoH / 2, logoW, logoH);
    cursorX += logoW + gap;

    ctx.font = fontMarca;
    ctx.fillStyle = colorTextoPill;
    ctx.globalAlpha = 1;
    ctx.fillText("Psicope.cba", cursorX, centerY);
    cursorX += wMarca + gap;

    ctx.font = fontSep;
    ctx.globalAlpha = 0.5;
    ctx.fillText("|", cursorX, centerY);
    cursorX += wSep + gap;

    ctx.font = fontTag;
    ctx.globalAlpha = 0.85;
    ctx.fillText("Lic. Brenda Grossi", cursorX, centerY);
    ctx.restore();

    // PNG (no JPEG): es una gráfica con texto y bordes definidos, no una
    // foto -- la compresión JPEG le suavizaba/emborronaba los bordes del
    // texto y las líneas finas, se notaba "poco nítido" en la web.
    return { dataUrl: canvas.toDataURL("image/png"), centros };
  } catch (err) {
    console.error("No se pudo componer la imagen del posteo:", err);
    return { dataUrl: null, centros: null };
  }
};

// Le agrega a un post (recién generado o cargado de la base) la imagen ya
// compuesta con el texto -- la imagen compuesta no se guarda en la base,
// se arma en el navegador cada vez a partir de la foto y los textos cortos.
// Si el post YA tiene una imagen compuesta, no la vuelve a armar (salvo
// `forzar: true`) -- antes se recomponían TODAS las tarjetas visibles cada
// vez que se generaba una más, así que el fondo de las que ya estaban
// generadas cambiaba solo, aunque su texto siguiera igual.
//
// Fondo (fondoIdx + paleta) y texto (estiloIdx + fuentes) son dos
// identidades separadas: cada una se mantiene si el post (o quien llama)
// ya tenía una elegida, y solo se sortea una nueva para lo que de verdad
// cambió. Así "cambiar fondo" (que solo pasa `evitarIdx` para el fondo)
// deja estilo/paleta/letra del texto intactos.
//
// `tipoFondo` agrega un tercer camino además de "foto subida a mano" e
// "ilustrado": "foto_real" trae una foto de escritorio/café real de un
// banco de fotos (ver dibujarFondoFotoReal + buscar-foto-fondo) en vez de
// dibujar un fondo desde cero. Si no viene explícito, se sortea con
// PROBABILIDAD_FOTO_REAL de chance (no 1 en 13 como si fuera un fondo
// ilustrado más -- así se nota de verdad, con 2 tarjetas por tanda hay
// más de la mitad de chance de que aparezca al menos una). Si la foto no
// se puede traer (sin conexión, cupo agotado, etc.), cae solo a un fondo
// ilustrado normal en vez de romper la generación.
const PROBABILIDAD_FOTO_REAL = 0.35;
const procesarPost = async (post, opciones = {}) => {
  if (!post) return post;
  const { forzar = false, fondoIdx = null, estiloIdx = null, evitarIdx = [], paleta = null, fuentes = null, tipoFondo = null, estiloFotoIdx = null } = opciones;
  if (post.imagen_compuesta && !forzar) return post;

  // Color y altura de cada texto (principal/secundario), por separado:
  // elecciones deliberadas del admin (color con el selector, altura
  // arrastrando el texto en la imagen) -- se mantienen SIEMPRE que no se
  // pasen explícitas, incluso en "cambiar fondo"/"cambiar texto" (que sí
  // resortean estilo/letra al azar). Vienen de la base
  // (post.color_texto_principal/secundario, offset_y_principal/secundario,
  // recién cargado) o del estado ya procesado en esta sesión.
  const colorPrincipalFinal = opciones.colorPrincipal !== undefined ? opciones.colorPrincipal : (post.color_texto_principal ?? post._colorPrincipal ?? null);
  const colorSecundarioFinal = opciones.colorSecundario !== undefined ? opciones.colorSecundario : (post.color_texto_secundario ?? post._colorSecundario ?? null);
  const offsetPFinal = opciones.offsetP !== undefined ? opciones.offsetP : (post.offset_y_principal ?? post._offsetP ?? 0);
  const offsetSFinal = opciones.offsetS !== undefined ? opciones.offsetS : (post.offset_y_secundario ?? post._offsetS ?? 0);
  // Mismo criterio que el offset, pero para el giro/inclinación de cada
  // texto (grados, -45 a 45).
  const rotPFinal = opciones.rotP !== undefined ? opciones.rotP : (post.rotacion_principal ?? post._rotP ?? 0);
  const rotSFinal = opciones.rotS !== undefined ? opciones.rotS : (post.rotacion_secundaria ?? post._rotS ?? 0);

  // Semilla de la aleatoriedad "decorativa" (blobs/garabatos/stickers del
  // fondo, sparkle de foto real) -- se pasa explícita cuando la llamada
  // NO debe cambiar el fondo (arrastrar texto, editar texto, cambiar
  // color), reusando la de antes byte a byte. Si no se pasa nada, se
  // sortea una nueva (generación nueva, "cambiar fondo", "cambiar texto").
  const semillaFinal = opciones.semilla !== undefined ? opciones.semilla : Math.floor(Math.random() * 2 ** 31) + 1;

  const esFoto = !!post.imagen_url;
  let tipoFinal = esFoto ? "manual" : (tipoFondo || post._tipoFondo || null);
  let fotoFondoReal = esFoto ? null : (post._fotoFondoReal || null);

  if (!esFoto && !tipoFinal) {
    tipoFinal = Math.random() < PROBABILIDAD_FOTO_REAL ? "foto_real" : "ilustrado";
  }

  if (!esFoto && tipoFinal === "foto_real" && !fotoFondoReal) {
    try {
      const { data, error } = await supabase.functions.invoke("buscar-foto-fondo", {});
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.url) throw new Error("Pexels no devolvió una foto usable");
      fotoFondoReal = data;
    } catch (err) {
      console.error("No se pudo traer una foto de fondo real, usando fondo ilustrado:", err);
      tipoFinal = "ilustrado";
    }
  }

  const fIdx = fondoIdx !== null ? fondoIdx : elegirIdx(FONDOS.length, evitarIdx);
  const eIdx = estiloIdx !== null ? estiloIdx : (post._estiloIdx ?? elegirIdx(ESTILOS_TEXTO.length));
  const eFotoIdx = estiloFotoIdx !== null ? estiloFotoIdx : (post._estiloFotoIdx ?? elegirIdx(ESTILOS_TEXTO_FOTO.length));
  const paletaFinal = paleta || post._paleta || PALETAS[Math.floor(Math.random() * PALETAS.length)];
  const fuentesFinal = fuentes || post._fuentes || (tipoFinal === "foto_real" ? elegirFuentesFoto() : elegirFuentes());
  const { dataUrl: imagenCompuesta, centros } = await componerImagenPost(
    post.imagen_url,
    post.texto_imagen_principal,
    post.texto_imagen_secundario,
    fIdx,
    eIdx,
    paletaFinal,
    fuentesFinal,
    tipoFinal === "foto_real" ? "foto_real" : "ilustrado",
    fotoFondoReal,
    eFotoIdx,
    colorPrincipalFinal,
    colorSecundarioFinal,
    offsetPFinal,
    offsetSFinal,
    semillaFinal,
    rotPFinal,
    rotSFinal
  );
  return {
    ...post,
    imagen_compuesta: imagenCompuesta,
    _seed: semillaFinal,
    // Centro vertical real (px lógicos) de cada bloque de texto en LO QUE
    // SE ACABA DE DIBUJAR -- el arrastre lo usa para saber a cuál de los
    // dos se acercó el clic, en vez de adivinar con la mitad de la imagen.
    _centroPrincipal: centros?.principal ?? null,
    _centroSecundario: centros?.secundario ?? null,
    _fondoIdx: esFoto || tipoFinal === "foto_real" ? null : fIdx,
    _estiloIdx: esFoto || tipoFinal === "foto_real" ? null : eIdx,
    _estiloFotoIdx: esFoto || tipoFinal !== "foto_real" ? null : eFotoIdx,
    _paleta: esFoto || tipoFinal === "foto_real" ? null : paletaFinal,
    _fuentes: fuentesFinal,
    _tipoFondo: esFoto ? null : tipoFinal,
    _fotoFondoReal: esFoto ? null : fotoFondoReal,
    _colorPrincipal: colorPrincipalFinal,
    _colorSecundario: colorSecundarioFinal,
    _offsetP: offsetPFinal,
    _offsetS: offsetSFinal,
    _rotP: rotPFinal,
    _rotS: rotSFinal,
  };
};

export default function AsistenteIA({ onPublicar }) {
  const [abierto, setAbierto] = useState(false);
  const [slots, setSlots] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [generandoId, setGenerandoId] = useState(null); // "nuevo" o el id que se está regenerando
  const [eliminandoId, setEliminandoId] = useState(null);
  const [arrastrandoTextoId, setArrastrandoTextoId] = useState(null);
  // Con qué tema generar la próxima tanda -- si se deja vacío, el asistente
  // elige solo (modo automático).
  const [temaManual, setTemaManual] = useState("");

  // Referencia siempre actualizada de "slots" para leer dentro de funciones
  // async sin quedarse con una copia vieja (closures de React) -- crítico
  // para generarTodosLosVacios, que llama a generarUno varias veces seguidas
  // y cada llamada necesita ver el resultado de la anterior.
  const slotsRef = useRef([]);
  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);

  useEffect(() => {
    if (abierto) cargarSlots();
  }, [abierto]);

  const cargarSlots = async () => {
    setCargando(true);
    try {
      const { data, error } = await supabase
        .from("asistente_ig_posts")
        .select("*")
        .eq("estado", "borrador")
        .order("created_at", { ascending: false })
        .limit(MAX_SLOTS);
      if (error) throw error;
      const indicesFondo = elegirIndicesFondo((data || []).length);
      const procesados = await Promise.all((data || []).map((post, i) => procesarPost(post, { fondoIdx: indicesFondo[i] })));
      setSlots(procesados);
    } catch {
      Swal.fire("Error", "No se pudo cargar el asistente.", "error");
    } finally {
      setCargando(false);
    }
  };

  // Un solo intento de generación (sin reintento ni manejo de errores acá
  // -- eso lo maneja quien llama). Separado para poder reintentar fácil.
  const invocarGeneracion = async (body) => {
    const { data, error } = await supabase.functions.invoke("generar-post-ia", { body });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  };

  // `silencioso`: no muestra su propio error con Swal -- lo usa
  // generarTodosLosVacios para juntar un solo resumen al final (con el
  // motivo real del último error) en vez de una alerta bloqueante por cada
  // intento fallido. Reintenta hasta 2 veces más, con una pausa creciente
  // entre intentos, ante un error transitorio (ej: rate limit).
  // `reemplazarId`: en vez de agregar el posteo nuevo a la lista, reemplaza
  // en el mismo lugar al que tiene ese id -- lo usa el botón "Generar
  // nuevo" de una tarjeta ya generada (se entiende que la anterior no
  // convenció, así que se descarta sola, sin preguntar motivo, y queda
  // igual registrada para el aprendizaje).
  // Importante: NUNCA se recomponen las tarjetas que ya estaban generadas
  // -- antes se volvía a armar la imagen de TODA la lista visible cada vez
  // que se sumaba una más, así que el fondo de las que ya estaban listas
  // cambiaba solo aunque su texto no se hubiera tocado.
  const generarUno = async (opciones = {}) => {
    const silencioso = opciones?.silencioso === true;
    const tema = opciones?.tema || undefined;
    const reemplazarId = opciones?.reemplazarId || null;
    setGenerandoId(reemplazarId || "nuevo");
    let ultimoError = null;
    try {
      let data = null;
      for (let intento = 0; intento < 3 && !data; intento++) {
        try {
          data = await invocarGeneracion(tema ? { tema } : {});
        } catch (err) {
          ultimoError = err;
          if (intento < 2) await new Promise((r) => setTimeout(r, 2500 * (intento + 1)));
        }
      }
      if (!data) throw ultimoError || new Error("No se pudo generar el posteo.");

      if (reemplazarId) {
        await supabase.from("asistente_ig_posts").update({
          estado: "descartado",
          feedback: "Se pidió generar uno nuevo directamente (sin motivo puntual).",
        }).eq("id", reemplazarId);
        const evitar = slotsRef.current
          .filter((s) => s.id !== reemplazarId)
          .map((s) => s._fondoIdx)
          .filter((x) => x !== null && x !== undefined);
        const procesado = await procesarPost(data, { evitarIdx: evitar });
        setSlots((prev) => prev.map((s) => (s.id === reemplazarId ? procesado : s)));
      } else {
        const evitar = slotsRef.current.map((s) => s._fondoIdx).filter((x) => x !== null && x !== undefined);
        const procesado = await procesarPost(data, { evitarIdx: evitar });
        setSlots((prev) => [procesado, ...prev].slice(0, MAX_SLOTS));
      }
      return { ok: true };
    } catch (err) {
      if (!silencioso) Swal.fire("Error", err.message || "No se pudo generar el posteo.", "error");
      return { ok: false, error: err.message || "Error desconocido" };
    } finally {
      setGenerandoId(null);
    }
  };

  const generarTodosLosVacios = async () => {
    const faltan = MAX_SLOTS - slots.length;
    const tema = temaManual.trim() || undefined;
    let exitosos = 0;
    let ultimoError = null;
    for (let i = 0; i < faltan; i++) {
      const resultado = await generarUno({ silencioso: true, tema });
      if (resultado.ok) exitosos += 1;
      else ultimoError = resultado.error;
      // Pausa entre pedidos seguidos, para no pisar un límite de frecuencia
      // de la API por mandar todo junto de golpe.
      if (i < faltan - 1) await new Promise((r) => setTimeout(r, 3000));
    }
    if (exitosos < faltan) {
      Swal.fire({
        icon: "warning",
        title: `Se generaron ${exitosos} de ${faltan}`,
        text: ultimoError
          ? `El motivo del último error fue: "${ultimoError}". Probá 'Generar' de nuevo para completar los que faltan.`
          : "Probá 'Generar' de nuevo para completar los que faltan.",
      });
    }
  };

  // "Cambiar texto": mantiene el fondo, la paleta y el contenido
  // EXACTAMENTE igual -- solo cambia CÓMO se representa el texto (estilo
  // -- posición/alineación -- y letra), sorteando algo nuevo y evitando
  // los últimos estilos que ya tuvo. El mismo mecanismo que "Cambiar
  // fondo" pero para la capa de texto: instantáneo, client-side, sin
  // pasar por la IA.
  const cambiarTexto = async (post) => {
    setGenerandoId(post.id);
    try {
      const tipoActual = post.imagen_url ? null : (post._tipoFondo || "ilustrado");
      if (tipoActual === "foto_real") {
        // Foto real también tiene varias formas de poner el texto (ver
        // ESTILOS_TEXTO_FOTO) -- "cambiar texto" resortea layout + letra
        // juntos, evitando los últimos 3 layouts que ya tuvo, la foto de
        // fondo queda igual.
        const historialPrevio = post._estiloFotoHistorial || [];
        const evitar = post._estiloFotoIdx !== null && post._estiloFotoIdx !== undefined
          ? [...historialPrevio, post._estiloFotoIdx].slice(-3)
          : historialPrevio.slice(-3);
        const procesado = await procesarPost(post, {
          forzar: true,
          tipoFondo: "foto_real",
          estiloFotoIdx: elegirIdx(ESTILOS_TEXTO_FOTO.length, evitar),
          fuentes: elegirFuentesFoto(),
          semilla: post._seed,
        });
        setSlots((prev) => prev.map((s) => (s.id === post.id ? { ...procesado, _estiloFotoHistorial: evitar } : s)));
      } else {
        const historialPrevio = post.imagen_url ? [] : (post._estiloHistorial || []);
        const evitar = post._estiloIdx !== null && post._estiloIdx !== undefined
          ? [...historialPrevio, post._estiloIdx].slice(-3)
          : historialPrevio.slice(-3);
        const procesado = await procesarPost(post, {
          forzar: true,
          fondoIdx: post.imagen_url ? null : post._fondoIdx,
          paleta: post._paleta,
          tipoFondo: "ilustrado",
          estiloIdx: elegirIdx(ESTILOS_TEXTO.length, evitar),
          fuentes: elegirFuentes(),
          semilla: post._seed,
        });
        setSlots((prev) => prev.map((s) => (s.id === post.id ? { ...procesado, _estiloHistorial: evitar } : s)));
      }
    } catch {
      Swal.fire("Error", "No se pudo cambiar el texto.", "error");
    } finally {
      setGenerandoId(null);
    }
  };

  // "Cambiar fondo": recompone la MISMA imagen (mismo texto, misma
  // Escapado básico para meter texto del admin dentro de un <textarea> o un
  // atributo value="" armado a mano -- si el texto trae comillas o < >,
  // rompía el HTML del formulario.
  const escaparHtml = (texto) => (texto || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  // "Editar texto": cambia el CONTENIDO de las dos frases que van sobre la
  // imagen (no solo cómo se representan, como "Cambiar texto") -- guarda el
  // cambio en la base y recompone la imagen manteniendo intacto todo lo
  // demás (mismo fondo/foto, misma paleta, mismo estilo, misma letra).
  const editarTextoImagen = async (post) => {
    // Valor inicial de cada selector de color: el que ya haya elegido antes
    // el admin PARA ESE TEXTO puntual, o si no, el color "por defecto" que
    // le tocó a este posteo (el de la paleta ilustrada, o blanco en foto
    // real) -- un <input type="color"> siempre necesita un valor real, no
    // puede arrancar "sin color". Principal y secundario tienen cada uno
    // el suyo, independiente.
    const colorDefault = post._paleta?.texto || "#FFFFFF";
    const colorPrincipalActual = post._colorPrincipal || colorDefault;
    const colorSecundarioActual = post._colorSecundario || colorDefault;
    const { value: valores } = await Swal.fire({
      title: "Editar texto de la imagen",
      html: `
        <div class="swal-edit-container">
          <div class="swal-form-group">
            <label class="swal-label">Texto principal (máx. 8 palabras aprox.)</label>
            <textarea id="ia-input-principal" class="swal-textarea-custom" rows="2">${escaparHtml(post.texto_imagen_principal)}</textarea>
            <div class="ia-color-fila">
              <input id="ia-input-color-principal" type="color" class="ia-color-input" value="${colorPrincipalActual}">
              <span id="ia-color-valor-principal" class="ia-color-valor">${colorPrincipalActual}</span>
            </div>
          </div>
          <div class="swal-form-group">
            <label class="swal-label">Texto secundario (máx. 12 palabras aprox.)</label>
            <textarea id="ia-input-secundario" class="swal-textarea-custom" rows="2">${escaparHtml(post.texto_imagen_secundario)}</textarea>
            <div class="ia-color-fila">
              <input id="ia-input-color-secundario" type="color" class="ia-color-input" value="${colorSecundarioActual}">
              <span id="ia-color-valor-secundario" class="ia-color-valor">${colorSecundarioActual}</span>
            </div>
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: "Guardar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#D48CA6",
      width: "550px",
      didOpen: () => {
        const inputP = document.getElementById("ia-input-color-principal");
        const valorP = document.getElementById("ia-color-valor-principal");
        inputP.addEventListener("input", () => { valorP.textContent = inputP.value; });
        const inputS = document.getElementById("ia-input-color-secundario");
        const valorS = document.getElementById("ia-color-valor-secundario");
        inputS.addEventListener("input", () => { valorS.textContent = inputS.value; });
      },
      preConfirm: () => {
        const principal = document.getElementById("ia-input-principal").value.trim();
        const secundario = document.getElementById("ia-input-secundario").value.trim();
        const colorPrincipal = document.getElementById("ia-input-color-principal").value;
        const colorSecundario = document.getElementById("ia-input-color-secundario").value;
        if (!principal || !secundario) {
          Swal.showValidationMessage("Completá los dos textos");
          return null;
        }
        return { principal, secundario, colorPrincipal, colorSecundario };
      },
    });
    if (!valores) return;

    setGenerandoId(post.id);
    try {
      const { error } = await supabase
        .from("asistente_ig_posts")
        .update({
          texto_imagen_principal: valores.principal,
          texto_imagen_secundario: valores.secundario,
          color_texto_principal: valores.colorPrincipal,
          color_texto_secundario: valores.colorSecundario,
        })
        .eq("id", post.id);
      if (error) throw error;

      const postActualizado = {
        ...post,
        texto_imagen_principal: valores.principal,
        texto_imagen_secundario: valores.secundario,
        color_texto_principal: valores.colorPrincipal,
        color_texto_secundario: valores.colorSecundario,
      };
      const procesado = await procesarPost(postActualizado, {
        forzar: true,
        tipoFondo: post._tipoFondo || "ilustrado",
        fondoIdx: post._fondoIdx,
        estiloIdx: post._estiloIdx,
        estiloFotoIdx: post._estiloFotoIdx,
        paleta: post._paleta,
        fuentes: post._fuentes,
        colorPrincipal: valores.colorPrincipal,
        colorSecundario: valores.colorSecundario,
        semilla: post._seed,
      });
      setSlots((prev) => prev.map((s) => (s.id === post.id ? procesado : s)));
    } catch (err) {
      Swal.fire("Error", "No se pudo guardar el texto.", "error");
    } finally {
      setGenerandoId(null);
    }
  };

  // Arrastrar un bloque de texto directo sobre la imagen ya armada, para
  // subirlo o bajarlo -- SIN mover el otro bloque. Ya no hay que adivinar
  // a qué bloque se refiere el clic: cada uno tiene su propio "cuadradito"
  // agarrable (ver JSX, ia-handle-texto), posicionado con el centro real
  // que devolvió la función de estilo (_centroPrincipal/_centroSecundario)
  // -- así que acá `bloque` ya viene sabido de antemano.
  //
  // Mientras se arrastra, el cuadradito se mueve YA (mutando su estilo
  // directo, sin pasar por React) para que se sienta instantáneo -- la
  // imagen entera recompone en paralelo, coalescida (si un recompuesto
  // todavía está en curso cuando llega un movimiento nuevo, no dispara uno
  // en paralelo, guarda el último pedido pendiente y lo dispara apenas
  // termina el anterior), que sí puede tardar un rato porque es un canvas
  // grande con texto y decoración -- antes el cuadradito esperaba lo mismo
  // que la imagen y se sentía lento. Solo guarda en la base UNA vez, al
  // soltar. No aplica a una foto subida a mano (esa usa otra composición,
  // sin este concepto de "bloque de texto" independiente).
  const manejarArrastreTexto = (e, post, bloque) => {
    if (post.imagen_url || generandoId !== null) return;
    e.preventDefault();
    e.stopPropagation();

    const esPrincipal = bloque === "principal";
    const campoOffset = esPrincipal ? "_offsetP" : "_offsetS";
    const campoOffsetDb = esPrincipal ? "offset_y_principal" : "offset_y_secundario";
    const anclaBase = (esPrincipal ? post._centroPrincipal : post._centroSecundario) ?? (esPrincipal ? ALTO * 0.35 : ALTO * 0.6);

    const handleEl = e.currentTarget;
    const wrapEl = handleEl.closest(".ia-imagen-wrap");
    const imgEl = wrapEl?.querySelector("img");
    const rectImg = imgEl?.getBoundingClientRect();
    const altoMostrado = rectImg?.height || 1;
    const escala = ALTO / altoMostrado;

    const yInicial = e.clientY;
    const offsetInicial = post[campoOffset] || 0;
    let offsetActual = offsetInicial;
    let componiendo = false;
    let pendiente = false;
    let seMovio = false;

    setArrastrandoTextoId(post.id);

    const recomponer = async () => {
      if (componiendo) { pendiente = true; return; }
      componiendo = true;
      const procesado = await procesarPost({ ...post, [campoOffset]: offsetActual }, {
        forzar: true,
        tipoFondo: post._tipoFondo || "ilustrado",
        fondoIdx: post._fondoIdx,
        estiloIdx: post._estiloIdx,
        estiloFotoIdx: post._estiloFotoIdx,
        paleta: post._paleta,
        fuentes: post._fuentes,
        colorPrincipal: post._colorPrincipal,
        colorSecundario: post._colorSecundario,
        offsetP: esPrincipal ? offsetActual : (post._offsetP || 0),
        offsetS: esPrincipal ? (post._offsetS || 0) : offsetActual,
        semilla: post._seed,
      });
      setSlots((prev) => prev.map((s) => (s.id === post.id ? procesado : s)));
      componiendo = false;
      if (pendiente) { pendiente = false; recomponer(); }
    };

    const alMover = (ev) => {
      seMovio = true;
      const deltaPantalla = ev.clientY - yInicial;
      // Tope para que no se pueda arrastrar tanto que el texto termine
      // afuera del todo del canvas (1920 de alto lógico).
      offsetActual = Math.max(-500, Math.min(500, offsetInicial + deltaPantalla * escala));
      if (handleEl) handleEl.style.top = `${((anclaBase + offsetActual - ZONA_TEXTO_ALTO / 2) / ALTO) * 100}%`;
      recomponer();
    };

    const alSoltar = async () => {
      document.removeEventListener("pointermove", alMover);
      document.removeEventListener("pointerup", alSoltar);
      setArrastrandoTextoId(null);
      if (!seMovio) return;
      try {
        await supabase.from("asistente_ig_posts").update({ [campoOffsetDb]: Math.round(offsetActual) }).eq("id", post.id);
      } catch (err) {
        console.error("No se pudo guardar la posición del texto:", err);
      }
    };

    document.addEventListener("pointermove", alMover);
    document.addEventListener("pointerup", alSoltar);
  };

  // Girar un bloque de texto -- el ícono de rotar, abajo a la derecha del
  // recuadro de cada texto (ver JSX, ia-handle-rotar). Arrastrar hacia la
  // derecha inclina en sentido horario, hacia la izquierda en sentido
  // antihorario -- tope de ±45° para que nunca quede ilegible. Mismo
  // patrón que mover: recompone coalescido, solo guarda en la base al
  // soltar.
  const manejarRotarTexto = (e, post, bloque) => {
    if (post.imagen_url || generandoId !== null) return;
    e.preventDefault();
    e.stopPropagation();

    const esPrincipal = bloque === "principal";
    const campoRot = esPrincipal ? "_rotP" : "_rotS";
    const campoRotDb = esPrincipal ? "rotacion_principal" : "rotacion_secundaria";

    const xInicial = e.clientX;
    const rotInicial = post[campoRot] || 0;
    let rotActual = rotInicial;
    let componiendo = false;
    let pendiente = false;
    let seMovio = false;

    setArrastrandoTextoId(post.id);

    const recomponer = async () => {
      if (componiendo) { pendiente = true; return; }
      componiendo = true;
      const procesado = await procesarPost({ ...post, [campoRot]: rotActual }, {
        forzar: true,
        tipoFondo: post._tipoFondo || "ilustrado",
        fondoIdx: post._fondoIdx,
        estiloIdx: post._estiloIdx,
        estiloFotoIdx: post._estiloFotoIdx,
        paleta: post._paleta,
        fuentes: post._fuentes,
        colorPrincipal: post._colorPrincipal,
        colorSecundario: post._colorSecundario,
        semilla: post._seed,
        rotP: esPrincipal ? rotActual : (post._rotP || 0),
        rotS: esPrincipal ? (post._rotS || 0) : rotActual,
      });
      setSlots((prev) => prev.map((s) => (s.id === post.id ? procesado : s)));
      componiendo = false;
      if (pendiente) { pendiente = false; recomponer(); }
    };

    const alMover = (ev) => {
      seMovio = true;
      const deltaPantalla = ev.clientX - xInicial;
      // ~0.15° por pixel arrastrado -- un recorrido de 300px hace el giro
      // completo de un extremo al otro.
      rotActual = Math.max(-45, Math.min(45, rotInicial + deltaPantalla * 0.15));
      recomponer();
    };

    const alSoltar = async () => {
      document.removeEventListener("pointermove", alMover);
      document.removeEventListener("pointerup", alSoltar);
      setArrastrandoTextoId(null);
      if (!seMovio) return;
      try {
        await supabase.from("asistente_ig_posts").update({ [campoRotDb]: Math.round(rotActual) }).eq("id", post.id);
      } catch (err) {
        console.error("No se pudo guardar el giro del texto:", err);
      }
    };

    document.addEventListener("pointermove", alMover);
    document.addEventListener("pointerup", alSoltar);
  };

  // "Cambiar fondo": recompone la MISMA imagen (mismo texto, misma
  // posición/color/letra del texto -- eso no se toca acá) con un fondo
  // nuevo. Vuelve a sortear el TIPO de fondo también (ilustrado o foto
  // real, con la misma probabilidad que al generar) en vez de quedarse
  // pegado al que ya tenía -- antes quedaba encerrado en el mismo tipo
  // para siempre, así que si a un posteo le tocaba ilustrado, clickear
  // "cambiar fondo" mil veces nunca iba a mostrar una foto real. Sortea
  // evitando los últimos 3 fondos ilustrados que ya tuvo (no solo el
  // inmediato anterior) para que no empiece a repetirse a los pocos
  // clics. Todo client-side, sin pasar por la IA (salvo que toque foto
  // real, que sí pide una nueva a Pexels). Si el post tenía una foto
  // propia subida, la reemplaza por un fondo generado (para volver atrás,
  // hay que subir la foto de nuevo).
  const cambiarFondo = async (post) => {
    setGenerandoId(post.id);
    try {
      const historialPrevio = post.imagen_url ? [] : (post._fondoHistorial || []);
      const evitar = post._fondoIdx !== null && post._fondoIdx !== undefined
        ? [...historialPrevio, post._fondoIdx].slice(-3)
        : historialPrevio.slice(-3);
      const procesado = await procesarPost(
        { ...post, imagen_url: null, _fondoHistorial: evitar, _fotoFondoReal: null, _tipoFondo: null },
        { forzar: true, evitarIdx: evitar }
      );
      setSlots((prev) => prev.map((s) => (s.id === post.id ? procesado : s)));
    } catch {
      Swal.fire("Error", "No se pudo cambiar el fondo.", "error");
    } finally {
      setGenerandoId(null);
    }
  };

  // "Eliminar": no pregunta motivo (se entiende que no gustó) -- igual
  // queda registrado como descartado para que la próxima generación
  // aprenda a no repetir temas/enfoques que se sacaron directo.
  const eliminarPost = async (post) => {
    setEliminandoId(post.id);
    try {
      await supabase.from("asistente_ig_posts").update({
        estado: "descartado",
        feedback: "Eliminado directo por el admin (sin motivo puntual).",
      }).eq("id", post.id);
      setSlots((prev) => prev.filter((s) => s.id !== post.id));
    } catch {
      Swal.fire("Error", "No se pudo eliminar.", "error");
    } finally {
      setEliminandoId(null);
    }
  };

  const publicarSlot = async (post) => {
    if (!onPublicar) return;
    await onPublicar(post);
    await supabase.from("asistente_ig_posts").update({ estado: "publicado" }).eq("id", post.id);
    setSlots((prev) => prev.filter((s) => s.id !== post.id));
  };

  // Subir una foto propia en vez del fondo generado -- se recompone al
  // toque con el mismo texto encima (`forzar` porque ya tenía una imagen
  // compuesta antes, y acá sí hay que reemplazarla).
  const subirImagenManual = async (post, archivo) => {
    if (!archivo) return;
    setGenerandoId(post.id);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(archivo);
      });
      const procesado = await procesarPost({ ...post, imagen_url: dataUrl }, { forzar: true, fuentes: post._fuentes });
      setSlots((prev) => prev.map((s) => (s.id === post.id ? procesado : s)));
    } catch {
      Swal.fire("Error", "No se pudo usar esa imagen.", "error");
    } finally {
      setGenerandoId(null);
    }
  };

  const huecos = MAX_SLOTS - slots.length;

  return (
    <>
      <button className="btn-asistente-ia" onClick={() => setAbierto(true)}>
        <FaMagic /> Asistente IA
      </button>

      {abierto && (
        <div className="ia-overlay">
          <div className="ia-modal ia-modal-ancho">
            <div className="ia-modal-header">
              <h3 className="ia-title"><FaMagic /> Asistente de Instagram</h3>
              <button className="ia-close" onClick={() => setAbierto(false)}><FaTimes /></button>
            </div>

            <div className="ia-modal-body">
            {cargando ? (
              <p className="ia-cargando">Cargando...</p>
            ) : (
              <>
                {huecos > 0 && (
                  <div className="ia-tema-box">
                    <input
                      className="ia-tema-input"
                      type="text"
                      placeholder="¿Sobre qué tema? (opcional -- si lo dejás vacío, elige uno solo)"
                      value={temaManual}
                      onChange={(e) => setTemaManual(e.target.value)}
                      disabled={generandoId !== null}
                    />
                    <button className="ia-btn-generar ia-btn-generar-todos" onClick={generarTodosLosVacios} disabled={generandoId !== null}>
                      {generandoId ? <><FaSpinner className="ia-spin" /> Pensando y escribiendo, puede tardar un rato...</> : <><FaMagic /> Generar borrador</>}
                    </button>
                    {temaManual.trim() && (
                      <p className="ia-tema-nota">Se va a generar un borrador sobre "{temaManual.trim()}".</p>
                    )}
                  </div>
                )}

                <div className="ia-slots">
                  {slots.map((post) => (
                    <div key={post.id} className="ia-slot ia-slot-lleno">
                      {post.imagen_compuesta ? (
                        <div className={`ia-imagen-wrap${arrastrandoTextoId === post.id ? " ia-imagen-arrastrando" : ""}`}>
                          <img src={post.imagen_compuesta} alt="" draggable={false} />
                          {post.imagen_url && (
                            <span className="ia-credito">Foto subida por vos</span>
                          )}
                          {!post.imagen_url && (
                            <>
                              <div
                                className="ia-frame-texto"
                                style={estiloZonaTexto((post._centroPrincipal ?? ALTO * 0.35) + (post._offsetP || 0))}
                                onPointerDown={(e) => manejarArrastreTexto(e, post, "principal")}
                                title="Arrastrá para mover el texto principal"
                              >
                                <button
                                  type="button"
                                  className="ia-handle-rotar"
                                  onPointerDown={(e) => manejarRotarTexto(e, post, "principal")}
                                  title="Arrastrá para inclinar el texto principal"
                                >
                                  <FaSyncAlt />
                                </button>
                              </div>
                              <div
                                className="ia-frame-texto"
                                style={estiloZonaTexto((post._centroSecundario ?? ALTO * 0.6) + (post._offsetS || 0))}
                                onPointerDown={(e) => manejarArrastreTexto(e, post, "secundario")}
                                title="Arrastrá para mover el texto secundario"
                              >
                                <button
                                  type="button"
                                  className="ia-handle-rotar"
                                  onPointerDown={(e) => manejarRotarTexto(e, post, "secundario")}
                                  title="Arrastrá para inclinar el texto secundario"
                                >
                                  <FaSyncAlt />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      ) : (
                        <div className="ia-imagen-faltante">
                          <FaExclamationTriangle />
                          <p>No se pudo armar la imagen (error en el navegador). Probá de nuevo o subí una foto.</p>
                        </div>
                      )}

                      <div className="ia-slot-panel">
                        <div className="ia-acciones">
                          <label className={`ia-btn-accion${generandoId === post.id ? " ia-btn-disabled" : ""}`}>
                            {generandoId === post.id ? <FaSpinner className="ia-spin" /> : <FaImage />} Cargar mi imagen
                            <input
                              type="file"
                              accept="image/*"
                              hidden
                              disabled={generandoId === post.id}
                              onChange={(e) => subirImagenManual(post, e.target.files?.[0])}
                            />
                          </label>
                          <button className="ia-btn-accion ia-btn-no-gusta" onClick={() => eliminarPost(post)} disabled={eliminandoId === post.id}>
                            {eliminandoId === post.id ? <FaSpinner className="ia-spin" /> : <FaTrash />} Eliminar
                          </button>
                          {onPublicar && (
                            <button className="ia-btn-accion" onClick={() => publicarSlot(post)}>
                              <FaShareSquare /> Publicar acá
                            </button>
                          )}
                          <button className="ia-btn-accion" onClick={() => cambiarFondo(post)} disabled={generandoId === post.id}>
                            {generandoId === post.id ? <FaSpinner className="ia-spin" /> : <FaSyncAlt />} Cambiar fondo
                          </button>
                          <button
                            className="ia-btn-accion"
                            onClick={() => generarUno({ reemplazarId: post.id, tema: temaManual.trim() || undefined })}
                            disabled={generandoId !== null}
                          >
                            {generandoId === post.id ? <FaSpinner className="ia-spin" /> : <FaRedo />} Generar nuevo
                          </button>
                          <button className="ia-btn-accion" onClick={() => cambiarTexto(post)} disabled={generandoId === post.id}>
                            {generandoId === post.id ? <FaSpinner className="ia-spin" /> : <FaFont />} Cambiar texto
                          </button>
                          <button className="ia-btn-accion" onClick={() => editarTextoImagen(post)} disabled={generandoId === post.id}>
                            {generandoId === post.id ? <FaSpinner className="ia-spin" /> : <FaEdit />} Editar texto
                          </button>
                        </div>

                        <div className="ia-slot-texto">
                          <h4 className="ia-post-titulo">{post.titulo}</h4>
                          <p className="ia-post-contenido">{post.contenido}</p>

                          {post.fuente_cientifica && (
                            <div className="ia-referencias">
                              <FaBookOpen />
                              <span>
                                Fuente científica:{" "}
                                <a href={post.fuente_cientifica.url} target="_blank" rel="noreferrer">
                                  {post.fuente_cientifica.titulo}
                                  {post.fuente_cientifica.autores ? ` -- ${post.fuente_cientifica.autores}` : ""}
                                  {post.fuente_cientifica.anio ? ` (${post.fuente_cientifica.anio})` : ""}
                                </a>
                                {post.fuente_cientifica.revista ? `, ${post.fuente_cientifica.revista}` : ""}
                                {" "}({post.fuente_cientifica.base})
                              </span>
                            </div>
                          )}

                          {post.referencias_generales?.length > 0 && (
                            <div className="ia-referencias">
                              <FaBookOpen />
                              <span>
                                También se basa en:{" "}
                                {post.referencias_generales.map((ref, i) => (
                                  <React.Fragment key={ref}>
                                    {i > 0 && ", "}
                                    <a
                                      href={`https://es.wikipedia.org/w/index.php?search=${encodeURIComponent(ref)}`}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      {ref}
                                    </a>
                                  </React.Fragment>
                                ))}
                                {" "}-- verificá antes de publicar.
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
