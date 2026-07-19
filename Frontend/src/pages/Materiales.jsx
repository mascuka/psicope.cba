import React, { useState, useEffect } from "react";
import { supabase } from "../supabase/supabaseClient";
import {
  FaPlus, FaTrash, FaEye, FaSearch, FaEdit, FaShoppingCart, FaDownload, FaTag
} from "react-icons/fa";
import Swal from "sweetalert2";
import { PDFDocument } from "pdf-lib";
import "./materiales.css";

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
  const [viewingPdf, setViewingPdf] = useState(null);
  const [cargandoPago, setCargandoPago] = useState(null);

  const [nuevoMaterial, setNuevoMaterial] = useState({
    nombre: "", descripcion: "", edad: "Todas las edades", precio: "", 
    en_oferta: false, porcentaje_descuento: 0, archivo: null, portada: null, preview: null,
    archivo_actual: "", portada_actual: "", preview_actual: "", nombre_descarga: ""
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
    const { data: compras } = await supabase.from("compras").select("material_id").eq("usuario_id", user.id);
    if (compras) setMisCompras(compras.map(c => c.material_id));
  };

  const fetchMateriales = async () => {
    const { data } = await supabase.from("materiales").select("*, compras(count)").order("created_at", { ascending: false });
    setMateriales(data || []);
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

  // --- FUNCIÓN DE COMPRA: ahora llama a la Edge Function segura de Supabase ---
  const handleComprar = async (material) => {
    if (!user) return Swal.fire("Atención", "Inicia sesión para poder comprar este material.", "info");

    setCargandoPago(material.id);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      const { data, error } = await supabase.functions.invoke("crear-preferencia", {
        body: { material_id: material.id },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.init_point) {
        window.location.href = data.init_point;
      } else {
        throw new Error("No se recibió el link de pago.");
      }
    } catch (error) {
      console.error("Error completo handleComprar:", error);
      Swal.fire("Error de Conexión", `Mercado Pago dice: ${error.message}`, "error");
    } finally {
      setCargandoPago(null);
    }
  };

  const handleSimularCompra = async (e, materialId) => {
    e.preventDefault();
    if (!user) return;
    
    const result = await Swal.fire({
        title: 'Modo Admin',
        text: "¿Deseas simular la compra de este material para pruebas?",
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#e5b3a8',
        confirmButtonText: 'Sí, simular'
    });

    if (!result.isConfirmed) return;

    setCargandoPago(materialId);

    try {
      const material = materiales.find(m => m.id === materialId);
      const { data: perfil } = await supabase.from("usuarios").select("nombre, email").eq("id", user.id).single();

      const precioFinal = material.en_oferta 
        ? (material.precio * (1 - material.porcentaje_descuento / 100)) 
        : material.precio;

      const { error } = await supabase.from("compras").insert([
        { 
          usuario_id: user.id, 
          material_id: materialId,
          nombre_usuario: perfil?.nombre || "Admin (Simulado)",
          email_usuario: perfil?.email || user.email,
          nombre_material: material.nombre,
          precio_pagado: precioFinal,
          status: "approved",
          payment_id: "SIM_" + Date.now()
        }
      ]);

      if (!error) {
        Swal.fire("¡Éxito!", "Simulación exitosa.", "success");
        setMisCompras(prev => [...prev, materialId]);
        fetchMateriales();
      } else {
        throw error;
      }
    } catch (error) {
      Swal.fire("Error", "No se pudo completar la simulación.", "error");
    } finally {
      setCargandoPago(null);
    }
  };

  const descargarArchivoSeguro = async (path, nombreDeseado) => {
    if (!path) return Swal.fire("Error", "No hay archivo configurado.", "error");
    try {
      const fileName = path.includes('/') ? path.split('/').pop().split('?')[0] : path;
      // Nombre final con el que se va a descargar el archivo (sin caracteres raros)
      const nombreLimpio = (nombreDeseado || "material")
        .trim()
        .replace(/[\\/:*?"<>|]/g, "")
        .slice(0, 100);
      const nombreDescarga = `${nombreLimpio || "material"}.pdf`;

      const { data, error } = await supabase.storage
        .from('materiales-privados')
        .createSignedUrl(fileName, 60, { download: nombreDescarga });
      if (error) throw error;
      window.open(data.signedUrl, '_blank');
    } catch (error) { 
        Swal.fire("Error", "El archivo no existe en el servidor privado.", "error"); 
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    setSubiendo(true);
    try {
      const original = materiales.find(m => m.id === editandoId);
      let archivo_url = original?.archivo_url || "";
      let imagen_portada = original?.imagen_portada || "";
      let preview_url = original?.preview_url || "";
      const tituloPdf = nuevoMaterial.nombre_descarga || nuevoMaterial.nombre;

      if (nuevoMaterial.archivo) {
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

      if (nuevoMaterial.preview) {
        if (editandoId && original?.preview_url) await eliminarArchivoStorage(original.preview_url, "materiales-didacticos");
        const fileName = `${Date.now()}_preview.pdf`;
        const previewRenombrado = await renombrarTituloPdf(nuevoMaterial.preview, `${tituloPdf} - Muestra`);
        const { error: upErr } = await supabase.storage.from("materiales-didacticos").upload(fileName, previewRenombrado);
        if (upErr) throw new Error("Error subiendo preview");
        preview_url = supabase.storage.from("materiales-didacticos").getPublicUrl(fileName).data.publicUrl;
      }

      const payload = {
        nombre: nuevoMaterial.nombre, 
        descripcion: nuevoMaterial.descripcion, 
        edad: nuevoMaterial.edad,
        precio: parseFloat(nuevoMaterial.precio) || 0, 
        en_oferta: nuevoMaterial.en_oferta,
        porcentaje_descuento: parseInt(nuevoMaterial.porcentaje_descuento || 0),
        archivo_url, 
        imagen_portada, 
        preview_url,
        nombre_descarga: nuevoMaterial.nombre_descarga || nuevoMaterial.nombre
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
    setNuevoMaterial({ nombre: "", descripcion: "", edad: "Todas las edades", precio: "", en_oferta: false, porcentaje_descuento: 0, archivo: null, portada: null, preview: null, archivo_actual: "", portada_actual: "", preview_actual: "" });
    setEditandoId(null); setShowModal(false);
  };

  const handleDelete = async (m) => {
    const res = await Swal.fire({ title: "¿Eliminar material?", text: "Esta acción no se puede deshacer.", icon: "warning", showCancelButton: true, confirmButtonColor: '#e5b3a8' });
    if (!res.isConfirmed) return;
    try {
      await eliminarArchivoStorage(m.archivo_url, "materiales-privados");
      await eliminarArchivoStorage(m.imagen_portada, "materiales-didacticos");
      await eliminarArchivoStorage(m.preview_url, "materiales-didacticos");
      await supabase.from("materiales").delete().eq("id", m.id);
      setMateriales(prev => prev.filter(item => item.id !== m.id));
      Swal.fire("Eliminado", "El material ha sido quitado.", "success");
    } catch (e) { Swal.fire("Error", "No se pudo eliminar.", "error"); }
  };

  if (loading) return <div className="materiales-page"><div className="loading-container"><p>Cargando materiales...</p></div></div>;

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
              const precioDesc = m.en_oferta ? (m.precio * (1 - m.porcentaje_descuento / 100)).toFixed(0) : m.precio;

              return (
                <div key={m.id} className="material-card">
                  <div className="card-image-container-premium">
                    <img src={m.imagen_portada || "https://via.placeholder.com/300x400?text=Sin+Portada"} alt={m.nombre} />
                    <div className="card-age-badge-overlay">{m.edad}</div>
                    {m.en_oferta && <div className="oferta-ribbon-extra">-{m.porcentaje_descuento}%</div>}
                  </div>
                  <div className="card-body">
                    <h4 className="card-title-premium">{m.nombre}</h4>
                    <p className="card-description">{m.descripcion}</p>
                    <div className="price-tag-centered-premium">
                        {m.en_oferta ? (
                          <><span className="price-old-p">${m.precio}</span><span className="price-current-p">${precioDesc}</span></>
                        ) : <span className="price-current-p">${m.precio}</span>}
                    </div>
                    <div className="card-actions">
                      <button className="btn-action-outline" onClick={() => setViewingPdf(m.preview_url)}><FaEye /> Muestra</button>
                      {comprado ? (
                        <button onClick={() => descargarArchivoSeguro(m.archivo_url, m.nombre_descarga || m.nombre)} className="btn-action-fill"><FaDownload /> Descargar</button>
                      ) : (
                        <button 
                          className="btn-action-fill" 
                          onClick={() => handleComprar(m)}
                          onContextMenu={(e) => isAdmin && handleSimularCompra(e, m.id)}
                          disabled={cargandoPago === m.id}
                        >
                          {cargandoPago === m.id ? "Procesando..." : <><FaShoppingCart /> Comprar</>}
                        </button>
                      )}
                    </div>
                    {isAdmin && (
                      <div className="admin-bar-right">
                        <span className="sales-info-pill"><FaTag /> {m.compras?.[0]?.count || 0}</span>
                        <button className="admin-btn-edit" onClick={() => { 
                            setEditandoId(m.id); 
                            setNuevoMaterial({
                                ...m, 
                                archivo: null, portada: null, preview: null,
                                archivo_actual: m.archivo_url,
                                portada_actual: m.imagen_portada?.split('/').pop().split('?')[0],
                                preview_actual: m.preview_url?.split('/').pop().split('?')[0],
                                nombre_descarga: m.nombre_descarga || m.nombre
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
            <textarea 
              placeholder="Descripción (Máximo 147 caracteres)" 
              maxLength={MAX_DESC} 
              rows={3}
              value={nuevoMaterial.descripcion} 
              onChange={e => setNuevoMaterial({...nuevoMaterial, descripcion: e.target.value})} 
            />
            <div className="char-count">{nuevoMaterial.descripcion.length} / {MAX_DESC}</div>
            
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
                    <input type="number" value={nuevoMaterial.precio} onChange={e => setNuevoMaterial({...nuevoMaterial, precio: e.target.value})} />
                </div>
            </div>

            <div className="oferta-box-styled" style={{display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'12px'}}>
                <label style={{display:'flex', gap:'10px', alignItems:'center', cursor:'pointer', fontWeight:'700', color:'var(--texto-cafe)'}}>
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
                    <span>PDF Completo (Privado):</span>
                    <input type="file" onChange={e => setNuevoMaterial({...nuevoMaterial, archivo: e.target.files[0]})} />
                    {editandoId && !nuevoMaterial.archivo && <small className="file-current-name">Actual: {nuevoMaterial.archivo_actual}</small>}
                </div>
                <div className="file-item">
                    <span>Imagen Portada (Público):</span>
                    <input type="file" onChange={e => setNuevoMaterial({...nuevoMaterial, portada: e.target.files[0]})} />
                    {editandoId && !nuevoMaterial.portada && <small className="file-current-name">Actual: {nuevoMaterial.portada_actual}</small>}
                </div>
                <div className="file-item">
                    <span>PDF Preview (Público):</span>
                    <input type="file" onChange={e => setNuevoMaterial({...nuevoMaterial, preview: e.target.files[0]})} />
                    {editandoId && !nuevoMaterial.preview && <small className="file-current-name">Actual: {nuevoMaterial.preview_actual}</small>}
                </div>
            </div>

            <button type="submit" className="btn-save-modal" disabled={subiendo}>{subiendo ? "Subiendo archivos..." : "Guardar Cambios"}</button>
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