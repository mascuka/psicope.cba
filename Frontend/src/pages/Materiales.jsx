import React, { useState, useEffect } from "react";
import { supabase } from "../supabase/supabaseClient";
import {
  FaPlus, FaTrash, FaEye, FaSearch, FaEdit, FaShoppingCart, FaDownload, FaTag
} from "react-icons/fa";
import Swal from "sweetalert2";
import { PDFDocument } from "pdf-lib";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import JSZip from "jszip";
import Loader from "../components/Loader";
import { useComprarMaterial } from "../hooks/useComprarMaterial";
import "./materiales.css";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

const PAGINAS_MUESTRA = 4; // cantidad de hojas que se usan para el PDF de "muestra"
const ANCHO_PORTADA_PX = 900; // ancho al que se renderiza la imagen de portada

export default function Materiales() {
  const [materiales, setMateriales] = useState([]);
  const [misCompras, setMisCompras] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEdad, setFiltroEdad] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const [showModal, setShowModal] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const [generandoAuto, setGenerandoAuto] = useState(false);
  const [viewingPdf, setViewingPdf] = useState(null);

  // Mismo flujo de compra real que usa Home.jsx (elegir método, formulario
  // de invitado, QR o Mercado Pago, espera + descarga) -- un solo lugar
  // para esta lógica, así los dos puntos de compra del sitio se comportan
  // siempre igual.
  const { comprar, cargandoPago } = useComprarMaterial({
    user,
    isAdmin,
    onCompraRegistrada: (materialId) => {
      setMisCompras((prev) => [...prev, materialId]);
      fetchMateriales();
    },
  });

  const [nuevoMaterial, setNuevoMaterial] = useState({
    nombre: "", descripcion: "", edad: "Todas las edades", precio: "",
    en_oferta: false, porcentaje_descuento: 0, es_gratis: false, archivo: null, portada: null, preview: null,
    archivo_actual: "", portada_actual: "", preview_actual: "", nombre_descarga: "",
    es_pack: false, materiales_incluidos: [], descuento_pack: 0, portada_manual: false
  });

  const MAX_DESC = 147;

  useEffect(() => {
    inicializar();
  }, []);

  const inicializar = async () => {
    await checkUser();
    await fetchMateriales();
    setLoading(false);
  };

  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUser(user);
    const { data: perfil } = await supabase.from("usuarios").select("rol").eq("id", user.id).single();
    if (perfil?.rol === "admin") setIsAdmin(true);
    const { data: compras } = await supabase.from("compras").select("material_id").eq("usuario_id", user.id).eq("status", "approved");
    if (compras) setMisCompras(compras.map(c => c.material_id));
  };

  // El contador de ventas que ve el admin en cada tarjeta tiene que contar
  // SOLO compras aprobadas -- por cada "Comprar" se crea una fila
  // "pendiente" en la base (para tener el email guardado antes de ir a
  // pagar, ver crear-preferencia/reservar-qr-cobro), y si el comprador
  // cancela el pago esa fila queda sin usar. Contarlas todas ("*,
  // compras(count)") inflaba el número con intentos que nunca se pagaron.
  const fetchMateriales = async () => {
    const [{ data }, { data: comprasAprobadas }] = await Promise.all([
      supabase.from("materiales").select("*").order("created_at", { ascending: false }),
      supabase.from("compras").select("material_id").eq("status", "approved"),
    ]);
    const conteos = {};
    (comprasAprobadas || []).forEach((c) => { conteos[c.material_id] = (conteos[c.material_id] || 0) + 1; });
    setMateriales((data || []).map((m) => ({ ...m, _ventasAprobadas: conteos[m.id] || 0 })));
  };

  // Renderiza la primera hoja del PDF como imagen JPG, para usarla de portada.
  const generarPortadaDesdePDF = async (file) => {
    const bytes = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
    const pagina = await pdf.getPage(1);
    const viewportBase = pagina.getViewport({ scale: 1 });
    const escala = ANCHO_PORTADA_PX / viewportBase.width;
    const viewport = pagina.getViewport({ scale: escala });

    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await pagina.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;

    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.88));
    return new File([blob], "portada.jpg", { type: "image/jpeg" });
  };

  // Arma un PDF nuevo con las primeras N hojas del material, para usarlo de muestra.
  const generarMuestraDesdePDF = async (file, titulo) => {
    const bytes = await file.arrayBuffer();
    const origen = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const totalPaginas = origen.getPageCount();
    const cantidad = Math.min(PAGINAS_MUESTRA, totalPaginas);
    const indices = Array.from({ length: cantidad }, (_, i) => i);

    const nuevo = await PDFDocument.create();
    const copiadas = await nuevo.copyPages(origen, indices);
    copiadas.forEach(p => nuevo.addPage(p));
    nuevo.setTitle(`${titulo || "Material"} - Muestra`);
    const nuevosBytes = await nuevo.save();
    return new File([nuevosBytes], "muestra.pdf", { type: "application/pdf" });
  };

  const cargarImagen = (url) => new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });

  // Dibuja "img" cubriendo todo el rectángulo (x,y,w,h), recortando lo que
  // sobre (como "object-fit: cover"). Con ancladoArriba=true el recorte se
  // hace desde arriba de la imagen en vez de centrado -- para la grilla de 4,
  // nos interesa la parte de arriba de cada portada (donde suele estar el
  // título), no el centro.
  const dibujarCover = (ctx, img, x, y, w, h, ancladoArriba) => {
    const escala = Math.max(w / img.width, h / img.height);
    const anchoEscalado = img.width * escala;
    const altoEscalado = img.height * escala;
    const offsetX = x - (anchoEscalado - w) / 2;
    const offsetY = ancladoArriba ? y : y - (altoEscalado - h) / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.drawImage(img, offsetX, offsetY, anchoEscalado, altoEscalado);
    ctx.restore();
  };

  // Arma la portada de un Pack combinando las portadas de los materiales que
  // lo componen: con 2 o 3 elegidos, usa los primeros 2 y arma una mitad
  // izquierda/mitad derecha; con 4 o más, usa los primeros 4 en una grilla
  // de 4, tomando la parte de arriba de cada portada para que entre bien.
  const generarPortadaPack = async (materialesIncluidos) => {
    const candidatos = materialesIncluidos.filter(m => m.imagen_portada);
    if (candidatos.length < 2) return null;

    const cantidadPaneles = candidatos.length >= 4 ? 4 : 2;
    const fuentes = candidatos.slice(0, cantidadPaneles);

    const ancho = cantidadPaneles === 4 ? 1000 : 1200;
    const alto = cantidadPaneles === 4 ? 1000 : 900;

    const canvas = document.createElement("canvas");
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#FAF6F0";
    ctx.fillRect(0, 0, ancho, alto);

    const imagenes = await Promise.all(fuentes.map(f => cargarImagen(f.imagen_portada).catch(() => null)));

    if (cantidadPaneles === 2) {
      const panelW = ancho / 2;
      imagenes.forEach((img, i) => {
        if (!img) return;
        dibujarCover(ctx, img, i * panelW, 0, panelW, alto, false);
      });
    } else {
      const panelW = ancho / 2;
      const panelH = alto / 2;
      imagenes.forEach((img, i) => {
        if (!img) return;
        const col = i % 2;
        const fila = Math.floor(i / 2);
        dibujarCover(ctx, img, col * panelW, fila * panelH, panelW, panelH, true);
      });
    }

    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", 0.88));
    return new File([blob], "portada-pack.jpg", { type: "image/jpeg" });
  };

  // Se dispara al elegir el PDF completo: genera portada y muestra solas,
  // salvo que el admin ya haya elegido versiones manuales.
  const handleArchivoPrincipalChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setNuevoMaterial(prev => ({ ...prev, archivo: file }));
    setGenerandoAuto(true);
    try {
      const titulo = nuevoMaterial.nombre_descarga || nuevoMaterial.nombre;
      const [portadaAuto, muestraAuto] = await Promise.all([
        generarPortadaDesdePDF(file),
        generarMuestraDesdePDF(file, titulo)
      ]);
      setNuevoMaterial(prev => ({ ...prev, portada: portadaAuto, preview: muestraAuto }));
    } catch (err) {
      console.error("Error generando portada/muestra automática:", err);
      Swal.fire("Atención", "No se pudo generar la portada y la muestra automáticamente. Podés subirlas manualmente más abajo.", "warning");
    } finally {
      setGenerandoAuto(false);
    }
  };

  // Suma/resta un material de la lista del pack que se está armando, guardando
  // una "foto" de su precio efectivo actual (con oferta ya aplicada si tenía)
  // y de su portada, para poder armar la portada combinada del pack.
  const toggleMaterialEnPack = async (mat) => {
    const yaIncluido = nuevoMaterial.materiales_incluidos.some(x => x.id === mat.id);
    const nuevaLista = yaIncluido
      ? nuevoMaterial.materiales_incluidos.filter(x => x.id !== mat.id)
      : [
          ...nuevoMaterial.materiales_incluidos,
          {
            id: mat.id,
            nombre: mat.nombre,
            precio_efectivo: mat.en_oferta ? Math.round(mat.precio * (1 - mat.porcentaje_descuento / 100)) : Number(mat.precio) || 0,
            imagen_portada: mat.imagen_portada || null,
          }
        ];

    setNuevoMaterial(prev => ({ ...prev, materiales_incluidos: nuevaLista }));

    // Si el admin no subió una portada manual, la vamos regenerando sola
    // cada vez que cambia la selección de materiales.
    if (!nuevoMaterial.portada_manual) {
      setGenerandoAuto(true);
      try {
        const portadaGenerada = await generarPortadaPack(nuevaLista);
        setNuevoMaterial(prev => ({ ...prev, materiales_incluidos: nuevaLista, portada: portadaGenerada }));
      } catch (err) {
        console.error("No se pudo generar la portada del pack automáticamente:", err);
      } finally {
        setGenerandoAuto(false);
      }
    }
  };

  // Arma un .zip con el PDF completo de cada material incluido en el pack,
  // usando su nombre de descarga; ese .zip pasa a ser el "archivo" propio
  // del pack, igual que cualquier material (mismo botón, misma descarga).
  const generarZipPack = async (materialesIncluidos, nombrePack) => {
    const zip = new JSZip();
    let agregados = 0;

    for (const item of materialesIncluidos) {
      const original = materiales.find(m => m.id === item.id);
      if (!original?.archivo_url) continue;

      const fileName = original.archivo_url.includes('/')
        ? original.archivo_url.split('/').pop().split('?')[0]
        : original.archivo_url;

      const { data, error } = await supabase.storage
        .from('materiales-privados')
        .createSignedUrl(fileName, 120);
      if (error || !data?.signedUrl) continue;

      const resp = await fetch(data.signedUrl);
      if (!resp.ok) continue;
      const blob = await resp.blob();

      const nombreLimpio = (original.nombre_descarga || original.nombre || "material")
        .trim()
        .replace(/[\\/:*?"<>|]/g, "")
        .slice(0, 80) || "material";

      zip.file(`${nombreLimpio}.pdf`, blob);
      agregados++;
    }

    if (agregados === 0) return null;

    const zipBlob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 9 } });
    const nombreZip = (nombrePack || "pack").trim().replace(/[\\/:*?"<>|]/g, "").slice(0, 80) || "pack";
    return new File([zipBlob], `${nombreZip}.zip`, { type: "application/zip" });
  };

  const eliminarArchivoStorage = async (path, bucket) => {
    if (!path) return;
    const fileName = path.includes('/') ? path.split('/').pop().split('?')[0] : path;
    const { error } = await supabase.storage.from(bucket).remove([fileName]);
    if (error) console.error("Error al borrar de storage:", error);
  };

  // Reescribe el metadato "Título" que trae el PDF (el que Chrome muestra en la
  // pestaña al abrirlo), para que coincida con el nombre que eligió el admin.
  const renombrarTituloPdf = async (file, tituloNuevo) => {
    try {
      const bytes = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });
      pdfDoc.setTitle(tituloNuevo || "Material");
      pdfDoc.setAuthor("Lic. Brenda Grossi");
      const nuevosBytes = await pdfDoc.save();
      return new File([nuevosBytes], file.name, { type: "application/pdf" });
    } catch (err) {
      console.error("No se pudo reescribir el título del PDF, se sube el original:", err);
      return file; // si falla, subimos el archivo tal cual para no bloquear la carga
    }
  };

  // Click derecho de admin sobre una card: simula la compra de ese
  // material para pruebas, con confirmación previa (a diferencia de
  // "Comprar", que para un admin acredita directo sin preguntar). Delega
  // en el mismo hook de compra que usa "Comprar" -- ver más abajo.
  const handleSimularCompra = async (e, materialId) => {
    e.preventDefault();
    if (!user) return;

    const result = await Swal.fire({
        title: 'Modo Admin',
        text: "¿Deseas simular la compra de este material para pruebas?",
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#D48CA6',
        confirmButtonText: 'Sí, simular'
    });

    if (!result.isConfirmed) return;
    const material = materiales.find(m => m.id === materialId);
    if (material) await comprar(material);
  };

  const verTextoCompleto = (titulo, texto) => {
    Swal.fire({
      title: titulo,
      html: `<p style="text-align:left; line-height:1.6; font-family:'Manrope', sans-serif; color:var(--color-texto);">${texto}</p>`,
      confirmButtonText: "Cerrar",
      confirmButtonColor: "#D48CA6",
    });
  };

  const descargarArchivoSeguro = async (path, nombreDeseado) => {
    if (!path) return Swal.fire("Error", "No hay archivo configurado.", "error");
    try {
      const fileName = path.includes('/') ? path.split('/').pop().split('?')[0] : path;
      // La extensión sale del archivo real guardado (un pack es .zip, el resto .pdf)
      const extension = fileName.includes('.') ? fileName.split('.').pop() : 'pdf';
      // Nombre final con el que se va a descargar el archivo (sin caracteres raros)
      const nombreLimpio = (nombreDeseado || "material")
        .trim()
        .replace(/[\\/:*?"<>|]/g, "")
        .slice(0, 100);
      const nombreDescarga = `${nombreLimpio || "material"}.${extension}`;

      const { data, error } = await supabase.storage
        .from('materiales-privados')
        .createSignedUrl(fileName, 60, { download: nombreDescarga });
      if (error) throw error;
      // Fuerza la descarga (Content-Disposition: attachment) -- se dispara
      // en esta misma pestaña, no hace falta abrir una nueva.
      window.location.href = data.signedUrl;
    } catch (error) {
        Swal.fire("Error", "El archivo no existe en el servidor privado.", "error");
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();

    if (nuevoMaterial.es_pack && nuevoMaterial.materiales_incluidos.length < 2) {
      Swal.fire("Faltan materiales", "Elegí al menos 2 materiales para armar el pack.", "warning");
      return;
    }

    setSubiendo(true);
    try {
      const original = materiales.find(m => m.id === editandoId);
      let archivo_url = original?.archivo_url || "";
      let imagen_portada = original?.imagen_portada || "";
      let preview_url = original?.preview_url || "";
      const tituloPdf = nuevoMaterial.nombre_descarga || nuevoMaterial.nombre;

      const precioBasePack = nuevoMaterial.materiales_incluidos.reduce((s, it) => s + (Number(it.precio_efectivo) || 0), 0);
      const precioFinalPack = Math.round(precioBasePack * (1 - (parseFloat(nuevoMaterial.descuento_pack) || 0) / 100));

      if (nuevoMaterial.es_pack) {
        // El "archivo" de un Pack es un .zip armado con el PDF de cada
        // material elegido -- se regenera siempre al guardar, por si la
        // selección cambió.
        if (editandoId && original?.archivo_url) await eliminarArchivoStorage(original.archivo_url, "materiales-privados");
        const zipFile = await generarZipPack(nuevoMaterial.materiales_incluidos, tituloPdf);
        if (!zipFile) throw new Error("No se pudo armar el .zip: verificá que los materiales elegidos tengan su PDF cargado.");
        const fileName = `${Date.now()}_pack.zip`;
        const { error: upErr } = await supabase.storage.from("materiales-privados").upload(fileName, zipFile);
        if (upErr) throw new Error(`Error subiendo el .zip del pack: ${upErr.message || upErr}`);
        archivo_url = fileName;
      } else if (nuevoMaterial.archivo) {
        if (editandoId && original?.archivo_url) await eliminarArchivoStorage(original.archivo_url, "materiales-privados");
        const fileName = `${Date.now()}_full.pdf`;
        const archivoRenombrado = await renombrarTituloPdf(nuevoMaterial.archivo, tituloPdf);
        const { error: upErr } = await supabase.storage.from("materiales-privados").upload(fileName, archivoRenombrado);
        if (upErr) throw new Error("Error subiendo PDF privado");
        archivo_url = fileName;
      }

      if (nuevoMaterial.portada) {
        if (editandoId && original?.imagen_portada) await eliminarArchivoStorage(original.imagen_portada, "materiales-didacticos");
        const fileName = `${Date.now()}_portada.jpg`;
        const { error: upErr } = await supabase.storage.from("materiales-didacticos").upload(fileName, nuevoMaterial.portada);
        if (upErr) throw new Error("Error subiendo portada");
        imagen_portada = supabase.storage.from("materiales-didacticos").getPublicUrl(fileName).data.publicUrl;
      }

      if (!nuevoMaterial.es_pack && nuevoMaterial.preview) {
        if (editandoId && original?.preview_url) await eliminarArchivoStorage(original.preview_url, "materiales-didacticos");
        const fileName = `${Date.now()}_preview.pdf`;
        const previewRenombrado = await renombrarTituloPdf(nuevoMaterial.preview, `${tituloPdf} - Muestra`);
        const { error: upErr } = await supabase.storage.from("materiales-didacticos").upload(fileName, previewRenombrado);
        if (upErr) throw new Error("Error subiendo preview");
        preview_url = supabase.storage.from("materiales-didacticos").getPublicUrl(fileName).data.publicUrl;
      }

      const payload = nuevoMaterial.es_pack ? {
        nombre: nuevoMaterial.nombre,
        descripcion: "",
        edad: nuevoMaterial.edad,
        precio: precioFinalPack,
        en_oferta: false,
        porcentaje_descuento: 0,
        archivo_url,
        imagen_portada,
        preview_url: "",
        nombre_descarga: nuevoMaterial.nombre_descarga || nuevoMaterial.nombre,
        es_pack: true,
        materiales_incluidos: nuevoMaterial.materiales_incluidos,
      } : {
        nombre: nuevoMaterial.nombre,
        descripcion: nuevoMaterial.descripcion,
        edad: nuevoMaterial.edad,
        precio: nuevoMaterial.es_gratis ? 0 : (parseFloat(nuevoMaterial.precio) || 0),
        en_oferta: nuevoMaterial.es_gratis ? false : nuevoMaterial.en_oferta,
        porcentaje_descuento: parseInt(nuevoMaterial.porcentaje_descuento || 0),
        archivo_url,
        imagen_portada,
        preview_url,
        nombre_descarga: nuevoMaterial.nombre_descarga || nuevoMaterial.nombre,
        es_pack: false,
        materiales_incluidos: [],
      };

      const { error } = editandoId
        ? await supabase.from("materiales").update(payload).eq("id", editandoId)
        : await supabase.from("materiales").insert([payload]);

      if (error) throw error;
      resetForm();
      fetchMateriales();
      Swal.fire("¡Listo!", "Material guardado correctamente.", "success");
    } catch (err) { 
      Swal.fire("Error", err.message || "No se pudo guardar.", "error"); 
    } finally { setSubiendo(false); }
  };

  const resetForm = () => {
    setNuevoMaterial({
      nombre: "", descripcion: "", edad: "Todas las edades", precio: "", en_oferta: false, porcentaje_descuento: 0, es_gratis: false, archivo: null, portada: null, preview: null, archivo_actual: "", portada_actual: "", preview_actual: "",
      es_pack: false, materiales_incluidos: [], descuento_pack: 0, portada_manual: false
    });
    setEditandoId(null); setShowModal(false);
  };

  const handleDelete = async (m) => {
    const res = await Swal.fire({ title: "¿Eliminar material?", text: "Esta acción no se puede deshacer.", icon: "warning", showCancelButton: true, confirmButtonColor: '#D48CA6' });
    if (!res.isConfirmed) return;

    Swal.fire({ title: 'Eliminando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    try {
      // Borra los 3 archivos del storage y anota si alguno falla (no corta el proceso).
      const erroresStorage = [];
      for (const [path, bucket] of [
        [m.archivo_url, "materiales-privados"],
        [m.imagen_portada, "materiales-didacticos"],
        [m.preview_url, "materiales-didacticos"]
      ]) {
        if (!path) continue;
        const fileName = path.includes('/') ? path.split('/').pop().split('?')[0] : path;
        const { error } = await supabase.storage.from(bucket).remove([fileName]);
        if (error) erroresStorage.push(`${bucket}: ${error.message}`);
      }

      const { error: errorDelete } = await supabase.from("materiales").delete().eq("id", m.id);
      if (errorDelete) throw errorDelete;

      setMateriales(prev => prev.filter(item => item.id !== m.id));

      if (erroresStorage.length > 0) {
        Swal.fire("Eliminado con avisos", `El material se borró de la base de datos, pero algunos archivos no se pudieron borrar del storage:\n${erroresStorage.join('\n')}`, "warning");
      } else {
        Swal.fire("Eliminado", "El material y todos sus archivos fueron eliminados correctamente.", "success");
      }
    } catch (e) {
      console.error("Error eliminando material:", e);
      const esConflicto = e.code === '23503' || /foreign key|violat/i.test(e.message || '');
      Swal.fire(
        "No se pudo eliminar",
        esConflicto
          ? "Este material tiene compras registradas asociadas, así que no se puede eliminar (quedaría un registro de venta sin material). Si necesitás sacarlo de la vista, marcalo o dejalo sin stock en vez de borrarlo."
          : (e.message || "Ocurrió un error al eliminar."),
        "error"
      );
      // Refrescamos por si el estado local quedó desincronizado con la base
      fetchMateriales();
    }
  };

  if (loading) return <div className="materiales-page"><Loader /></div>;

  // Para mostrar en vivo el precio del pack mientras el admin lo arma.
  const precioBasePackForm = nuevoMaterial.materiales_incluidos.reduce((s, it) => s + (Number(it.precio_efectivo) || 0), 0);
  const precioFinalPackForm = Math.round(precioBasePackForm * (1 - (parseFloat(nuevoMaterial.descuento_pack) || 0) / 100));

  return (
    <div className="materiales-page">
      <div className="materiales-content">
        <aside className="materiales-sidebar">
          <div className="filter-card">
            <h3><FaSearch /> Filtros</h3>
            <input className="search-input-sidebar" placeholder="Buscar material..." onChange={e => setBusqueda(e.target.value)} />
            <select className="select-sidebar" value={filtroEdad} onChange={e => setFiltroEdad(e.target.value)}>
              <option value="">Todas las edades</option>
              <option value="3-5 años">3-5 años</option>
              <option value="6-8 años">6-8 años</option>
              <option value="9-12 años">9-12 años</option>
            </select>
            {isAdmin && <button className="btn-nuevo-recurso" onClick={() => setShowModal(true)}><FaPlus /> Nuevo Material</button>}
          </div>
        </aside>

        <main className="materiales-grid">
          {materiales
            .filter(m => m.nombre.toLowerCase().includes(busqueda.toLowerCase()) && (filtroEdad === "" || m.edad === filtroEdad))
            .map(m => {
              const comprado = misCompras.includes(m.id);
              const esGratis = Number(m.precio) === 0;
              const precioDesc = m.en_oferta ? (m.precio * (1 - m.porcentaje_descuento / 100)).toFixed(0) : m.precio;

              return (
                <div key={m.id} className="material-card">
                  <div className="card-image-container-premium">
                    <img src={m.imagen_portada || "https://via.placeholder.com/300x400?text=Sin+Portada"} alt={m.nombre} />
                    <div className="card-age-badge-overlay">{m.edad}</div>
                    {m.es_pack && <div className="oferta-ribbon-extra ribbon-pack">Pack</div>}
                    {!m.es_pack && m.en_oferta && !esGratis && <div className="oferta-ribbon-extra">-{m.porcentaje_descuento}%</div>}
                    {!m.es_pack && esGratis && <div className="oferta-ribbon-extra ribbon-gratis">Gratis</div>}
                  </div>
                  <div className="card-body">
                    <h4 className="card-title-premium">{m.nombre}</h4>
                    {m.es_pack ? (
                      Array.isArray(m.materiales_incluidos) && m.materiales_incluidos.length > 0 && (
                        <p
                          className="card-description"
                          onClick={() => verTextoCompleto(m.nombre, `Incluye: ${m.materiales_incluidos.map(i => i.nombre).join(", ")}`)}
                        >
                          <strong>Incluye:</strong> {m.materiales_incluidos.map(i => i.nombre).join(", ")}
                        </p>
                      )
                    ) : (
                      <p className="card-description" onClick={() => verTextoCompleto(m.nombre, m.descripcion)}>{m.descripcion}</p>
                    )}
                    <div className={`price-tag-centered-premium${esGratis ? " es-gratis" : ""}`}>
                        <span className={`price-old-p${m.en_oferta ? "" : " price-old-p--oculto"}`}>
                          ${m.precio}
                        </span>
                        <span className="price-current-p">
                          {esGratis ? "¡Gratis!" : m.en_oferta ? `$${precioDesc}` : `$${m.precio}`}
                        </span>
                    </div>
                    <div className="card-actions">
                      {!m.es_pack && (
                        <button className="btn-action-outline" onClick={() => setViewingPdf(m.preview_url)} title="Ver muestra" aria-label="Ver muestra del material"><FaEye /></button>
                      )}
                      {comprado ? (
                        <button onClick={() => descargarArchivoSeguro(m.archivo_url, m.nombre_descarga || m.nombre)} className="btn-action-fill"><FaDownload /> Descargar</button>
                      ) : (
                        <button
                          className="btn-action-fill"
                          onClick={() => comprar(m)}
                          onContextMenu={(e) => isAdmin && handleSimularCompra(e, m.id)}
                          disabled={cargandoPago === m.id}
                        >
                          {cargandoPago === m.id ? "Procesando..." : esGratis ? <><FaDownload /> Adquirir</> : <><FaShoppingCart /> Comprar</>}
                        </button>
                      )}
                    </div>
                    {isAdmin && (
                      <div className="admin-bar-right">
                        <span className="sales-info-pill"><FaTag /> {m._ventasAprobadas || 0}</span>
                        <button className="admin-btn-edit" onClick={() => {
                            setEditandoId(m.id);
                            setNuevoMaterial({
                                ...m,
                                archivo: null, portada: null, preview: null,
                                archivo_actual: m.archivo_url,
                                portada_actual: m.imagen_portada?.split('/').pop().split('?')[0],
                                preview_actual: m.preview_url?.split('/').pop().split('?')[0],
                                nombre_descarga: m.nombre_descarga || m.nombre,
                                es_gratis: Number(m.precio) === 0,
                                es_pack: !!m.es_pack,
                                materiales_incluidos: Array.isArray(m.materiales_incluidos) ? m.materiales_incluidos : [],
                                descuento_pack: 0,
                                // Al editar un pack ya existente, protegemos la portada que ya tiene
                                // (no se regenera sola hasta que vuelvan a tocar la selección).
                                portada_manual: !!m.es_pack
                            });
                            setShowModal(true);
                        }}><FaEdit /></button>
                        <button className="admin-btn-delete" onClick={() => handleDelete(m)}><FaTrash /></button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
        </main>
      </div>

      {showModal && (
        <div className="modal-overlay">
          <form className="modal-container" onSubmit={handleUpload}>
            <h3>{editandoId ? "Editar Recurso" : "Nuevo Recurso"}</h3>
            <input required placeholder="Nombre" maxLength={50} value={nuevoMaterial.nombre} onChange={e => setNuevoMaterial({...nuevoMaterial, nombre: e.target.value})} />
            {!nuevoMaterial.es_pack && (
              <>
                <textarea
                  placeholder="Descripción (Máximo 147 caracteres)"
                  maxLength={MAX_DESC}
                  rows={3}
                  value={nuevoMaterial.descripcion}
                  onChange={e => setNuevoMaterial({...nuevoMaterial, descripcion: e.target.value})}
                />
                <div className="char-count">{nuevoMaterial.descripcion.length} / {MAX_DESC}</div>
              </>
            )}

            <div className="oferta-box-styled" style={{display:'flex', alignItems:'center', gap:'10px'}}>
                <label style={{display:'flex', gap:'10px', alignItems:'center', cursor:'pointer', fontWeight:'700', color:'var(--color-texto-oscuro)'}}>
                    <input
                        type="checkbox"
                        checked={nuevoMaterial.es_pack}
                        onChange={e => setNuevoMaterial({
                            ...nuevoMaterial,
                            es_pack: e.target.checked,
                            es_gratis: false,
                            en_oferta: false,
                        })}
                        disabled={!!editandoId}
                    />
                    Es un Pack (combo de varios materiales)
                    {!!editandoId && <small style={{fontWeight:400, color:'#888'}}> (no se puede cambiar editando; creá uno nuevo)</small>}
                </label>
            </div>

            {!nuevoMaterial.es_pack ? (
              <>
                <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'15px'}}>
                    <div className="file-item"><label>Edad:</label>
                        <select value={nuevoMaterial.edad} onChange={e => setNuevoMaterial({...nuevoMaterial, edad: e.target.value})}>
                            <option value="Todas las edades">Todas las edades</option>
                            <option value="3-5 años">3-5 años</option>
                            <option value="6-8 años">6-8 años</option>
                            <option value="9-12 años">9-12 años</option>
                        </select>
                    </div>
                    <div className="file-item"><label>Precio ($):</label>
                        <input type="number" value={nuevoMaterial.precio} disabled={nuevoMaterial.es_gratis} placeholder={nuevoMaterial.es_gratis ? "Gratis" : ""} onChange={e => setNuevoMaterial({...nuevoMaterial, precio: e.target.value})} />
                    </div>
                </div>

                <div className="oferta-box-styled" style={{display:'flex', alignItems:'center', gap:'10px'}}>
                    <label style={{display:'flex', gap:'10px', alignItems:'center', cursor:'pointer', fontWeight:'700', color:'var(--color-texto-oscuro)'}}>
                        <input
                            type="checkbox"
                            checked={nuevoMaterial.es_gratis}
                            onChange={e => setNuevoMaterial({
                                ...nuevoMaterial,
                                es_gratis: e.target.checked,
                                precio: e.target.checked ? "0" : "",
                                en_oferta: e.target.checked ? false : nuevoMaterial.en_oferta
                            })}
                        />
                        Este material es gratuito
                    </label>
                </div>

                {!nuevoMaterial.es_gratis && (
                    <div className="oferta-box-styled" style={{display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'12px'}}>
                        <label style={{display:'flex', gap:'10px', alignItems:'center', cursor:'pointer', fontWeight:'700', color:'var(--color-texto-oscuro)'}}>
                            <input type="checkbox" checked={nuevoMaterial.en_oferta} onChange={e => setNuevoMaterial({...nuevoMaterial, en_oferta: e.target.checked})} />
                            Activar Oferta
                        </label>
                        {nuevoMaterial.en_oferta && (
                            <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                                <input style={{width:'75px'}} type="number" value={nuevoMaterial.porcentaje_descuento} onChange={e => setNuevoMaterial({...nuevoMaterial, porcentaje_descuento: e.target.value})} />
                                <span style={{fontSize:'0.9rem'}}>% de descuento</span>
                            </div>
                        )}
                    </div>
                )}

                <div className="file-item">
                    <label>Nombre del archivo al descargar:</label>
                    <input
                      placeholder="Ej: Cuadernillo-Emociones-3-5-años"
                      value={nuevoMaterial.nombre_descarga}
                      onChange={e => setNuevoMaterial({...nuevoMaterial, nombre_descarga: e.target.value})}
                    />
                    <small style={{color:'#888'}}>Así se va a llamar el PDF cuando el usuario lo descargue (no hace falta poner .pdf).</small>
                </div>

                <div className="file-section-modal">
                    <div className="file-item">
                        <span>PDF Completo del material:</span>
                        <input type="file" accept="application/pdf" onChange={handleArchivoPrincipalChange} />
                        {editandoId && !nuevoMaterial.archivo && <small className="file-current-name">Actual: {nuevoMaterial.archivo_actual}</small>}
                        <small style={{color:'#888', fontWeight:400}}>
                            La portada y la muestra se generan solas a partir de este PDF: la 1° hoja se usa como portada, y las primeras {PAGINAS_MUESTRA} hojas como muestra.
                        </small>
                        {generandoAuto && <small style={{color:'var(--color-acento-hover)', fontWeight:700}}>Generando portada y muestra automáticamente...</small>}
                        {!generandoAuto && nuevoMaterial.portada && nuevoMaterial.preview && (
                            <small style={{color:'#5a9c6f', fontWeight:700}}>✓ Portada y muestra listas.</small>
                        )}
                    </div>

                    <details style={{marginTop:'8px'}}>
                        <summary style={{cursor:'pointer', fontSize:'0.85rem', color:'#888'}}>
                            ¿Preferís elegir la portada o la muestra manualmente?
                        </summary>
                        <div style={{display:'flex', flexDirection:'column', gap:'12px', marginTop:'12px'}}>
                            <div className="file-item">
                                <span>Imagen Portada (reemplaza a la automática):</span>
                                <input type="file" accept="image/*" onChange={e => setNuevoMaterial({...nuevoMaterial, portada: e.target.files[0]})} />
                                {editandoId && <small className="file-current-name">Actual: {nuevoMaterial.portada_actual}</small>}
                            </div>
                            <div className="file-item">
                                <span>PDF Preview (reemplaza a la automática):</span>
                                <input type="file" accept="application/pdf" onChange={e => setNuevoMaterial({...nuevoMaterial, preview: e.target.files[0]})} />
                                {editandoId && <small className="file-current-name">Actual: {nuevoMaterial.preview_actual}</small>}
                            </div>
                        </div>
                    </details>
                </div>
              </>
            ) : (
              <>
                <div className="file-item"><label>Edad (opcional):</label>
                    <select value={nuevoMaterial.edad} onChange={e => setNuevoMaterial({...nuevoMaterial, edad: e.target.value})}>
                        <option value="Todas las edades">Todas las edades</option>
                        <option value="3-5 años">3-5 años</option>
                        <option value="6-8 años">6-8 años</option>
                        <option value="9-12 años">9-12 años</option>
                    </select>
                </div>

                <div className="file-section-modal">
                    <div className="file-item">
                        <span>Elegí los materiales que incluye el pack (mínimo 2):</span>
                        <div className="pack-lista-materiales">
                            {materiales.filter(m => !m.es_pack && m.id !== editandoId).map(m => {
                                const incluido = nuevoMaterial.materiales_incluidos.some(x => x.id === m.id);
                                const precioEfectivo = m.en_oferta ? Math.round(m.precio * (1 - m.porcentaje_descuento / 100)) : Number(m.precio) || 0;
                                return (
                                    <label key={m.id} className={`pack-item-check${incluido ? ' activo' : ''}`}>
                                        <input type="checkbox" checked={incluido} onChange={() => toggleMaterialEnPack(m)} />
                                        <span className="pack-item-nombre">{m.nombre}</span>
                                        <span className="pack-item-precio">${precioEfectivo}{m.en_oferta && <small> (con oferta)</small>}</span>
                                    </label>
                                );
                            })}
                            {materiales.filter(m => !m.es_pack).length === 0 && (
                                <small style={{color:'#888'}}>Todavía no hay materiales cargados para armar un pack.</small>
                            )}
                        </div>
                    </div>
                </div>

                <div className="pack-resumen-precio">
                    <div className="pack-resumen-fila">
                        <span>Precio base ({nuevoMaterial.materiales_incluidos.length} material{nuevoMaterial.materiales_incluidos.length !== 1 ? 'es' : ''} seleccionado{nuevoMaterial.materiales_incluidos.length !== 1 ? 's' : ''}):</span>
                        <strong>${precioBasePackForm}</strong>
                    </div>
                    <div className="file-item">
                        <label>Descuento adicional del pack (%):</label>
                        <input type="number" min="0" max="100" value={nuevoMaterial.descuento_pack} onChange={e => setNuevoMaterial({...nuevoMaterial, descuento_pack: e.target.value})} />
                    </div>
                    <div className="pack-resumen-fila pack-resumen-final">
                        <span>Precio final del pack:</span>
                        <strong>${precioFinalPackForm}</strong>
                    </div>
                </div>

                <div className="file-item">
                    <span>Portada del pack:</span>
                    <small style={{color:'#888', fontWeight:400}}>
                        Se arma sola combinando las portadas de los materiales elegidos (2 o 3 → mitades; 4 o más → grilla). Si preferís una propia, subila acá y no se vuelve a tocar.
                    </small>
                    <input type="file" accept="image/*" onChange={e => setNuevoMaterial({...nuevoMaterial, portada: e.target.files[0], portada_manual: true})} />
                    {generandoAuto && <small style={{color:'var(--color-acento-hover)', fontWeight:700}}>Generando portada del pack...</small>}
                    {!generandoAuto && nuevoMaterial.portada && (
                        <small style={{color:'#5a9c6f', fontWeight:700}}>✓ Portada lista.</small>
                    )}
                    {editandoId && nuevoMaterial.portada_actual && <small className="file-current-name">Actual: {nuevoMaterial.portada_actual}</small>}
                </div>
              </>
            )}

            <button type="submit" className="btn-save-modal" disabled={subiendo || generandoAuto}>
                {generandoAuto
                  ? (nuevoMaterial.es_pack ? "Generando portada del pack..." : "Generando portada y muestra...")
                  : subiendo
                    ? (nuevoMaterial.es_pack ? "Armando el .zip y guardando..." : "Subiendo archivos...")
                    : "Guardar Cambios"}
            </button>
            <button type="button" onClick={resetForm} className="btn-cancel-modal">Cancelar</button>
          </form>
        </div>
      )}
      
      {viewingPdf && (
        <div className="modal-overlay-preview" onClick={() => setViewingPdf(null)}>
          <button className="close-preview-btn" onClick={() => setViewingPdf(null)}>✕</button>
          <div className="preview-content" onClick={(e) => e.stopPropagation()}>
            {viewingPdf && viewingPdf.toLowerCase().includes('.pdf') ? (
              <iframe src={`${viewingPdf}#toolbar=0`} title="Preview" />
            ) : (
              <img src={viewingPdf} alt="Preview" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}