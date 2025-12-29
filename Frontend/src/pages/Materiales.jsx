import React, { useState, useEffect } from "react";
import { supabase } from "../supabase/supabaseClient";
import {
  FaPlus, FaTrash, FaEye, FaSearch, FaEdit, FaShoppingCart, FaDownload, FaTag
} from "react-icons/fa";
import Swal from "sweetalert2";
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
    en_oferta: false, porcentaje_descuento: 0, archivo: null, portada: null, preview: null
  });

  const MAX_DESC = 147; // Límite solicitado

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

  // --- COMPRA MERCADO PAGO ---
  const handleComprar = async (material) => {
    if (!user) return Swal.fire("Atención", "Inicia sesión para comprar.", "info");
    setCargandoPago(material.id);
    const precioFinal = material.en_oferta ? (material.precio * (1 - material.porcentaje_descuento / 100)) : material.precio;
    try {
      const response = await fetch("https://api.mercadopago.com/checkout/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer APP_USR-TU_TOKEN" },
        body: JSON.stringify({
          items: [{ id: String(material.id), title: material.nombre, unit_price: parseFloat(precioFinal), quantity: 1, currency_id: "ARS" }],
          back_urls: { success: `${window.location.origin}/perfil`, failure: `${window.location.origin}/materiales` },
          external_reference: String(material.id)
        })
      });
      const data = await response.json();
      if (data.init_point) window.location.assign(data.init_point);
    } catch { Swal.fire("Error", "Error al conectar con Mercado Pago.", "error"); }
    finally { setCargandoPago(null); }
  };

  // --- SIMULADOR DESARROLLADOR (CLIC DERECHO) ---
  const handleSimularCompra = async (e, materialId) => {
    e.preventDefault();
    if (!user) return;
    setCargandoPago(materialId);
    setTimeout(async () => {
      const { error } = await supabase.from("compras").insert([{ usuario_id: user.id, material_id: materialId }]);
      if (!error) {
        Swal.fire("¡Éxito!", "Simulación de compra exitosa.", "success");
        setMisCompras(prev => [...prev, materialId]);
      }
      setCargandoPago(null);
    }, 800);
  };

  const descargarArchivoSeguro = async (path) => {
    try {
      const { data, error } = await supabase.storage.from('materiales-privados').createSignedUrl(path, 60);
      if (error) throw error;
      window.open(data.signedUrl, '_blank');
    } catch (error) { Swal.fire("Error", "No se pudo descargar.", "error"); }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    setSubiendo(true);
    try {
      const original = materiales.find(m => m.id === editandoId);
      let archivo_url = original?.archivo_url || "";
      let imagen_portada = original?.imagen_portada || "";
      let preview_url = original?.preview_url || "";

      if (nuevoMaterial.archivo) {
        const fileName = `${Date.now()}_full.pdf`;
        await supabase.storage.from("materiales-privados").upload(fileName, nuevoMaterial.archivo);
        archivo_url = fileName;
      }
      if (nuevoMaterial.portada) {
        const fileName = `${Date.now()}_portada.jpg`;
        await supabase.storage.from("materiales-didacticos").upload(fileName, nuevoMaterial.portada);
        imagen_portada = supabase.storage.from("materiales-didacticos").getPublicUrl(fileName).data.publicUrl;
      }
      if (nuevoMaterial.preview) {
        const fileName = `${Date.now()}_preview.pdf`;
        await supabase.storage.from("materiales-didacticos").upload(fileName, nuevoMaterial.preview);
        preview_url = supabase.storage.from("materiales-didacticos").getPublicUrl(fileName).data.publicUrl;
      }

      const payload = {
        nombre: nuevoMaterial.nombre, 
        descripcion: nuevoMaterial.descripcion, 
        edad: nuevoMaterial.edad,
        precio: parseFloat(nuevoMaterial.precio), 
        en_oferta: nuevoMaterial.en_oferta,
        porcentaje_descuento: parseInt(nuevoMaterial.porcentaje_descuento || 0),
        archivo_url, imagen_portada, preview_url
      };

      const { error } = editandoId 
        ? await supabase.from("materiales").update(payload).eq("id", editandoId)
        : await supabase.from("materiales").insert([payload]);

      if (error) throw error;
      resetForm(); fetchMateriales();
      Swal.fire("¡Guardado!", "Material actualizado correctamente.", "success");
    } catch (e) { Swal.fire("Error", "No se pudo guardar.", "error"); }
    finally { setSubiendo(false); }
  };

  const resetForm = () => {
    setNuevoMaterial({ nombre: "", descripcion: "", edad: "Todas las edades", precio: "", en_oferta: false, porcentaje_descuento: 0, archivo: null, portada: null, preview: null });
    setEditandoId(null); setShowModal(false);
  };

  const handleDelete = async (m) => {
    const res = await Swal.fire({ title: "¿Eliminar?", text: "Esta acción es irreversible.", icon: "warning", showCancelButton: true, confirmButtonColor: '#e5b3a8' });
    if (!res.isConfirmed) return;
    try {
      await supabase.from("materiales").delete().eq("id", m.id);
      fetchMateriales();
      Swal.fire("Eliminado", "", "success");
    } catch (e) { Swal.fire("Error", "No se pudo eliminar.", "error"); }
  };

  return (
    <div className="materiales-page">
      <div className="materiales-content">
        <aside className="materiales-sidebar">
          <div className="filter-card">
            <h3><FaSearch /> Filtros</h3>
            <input className="search-input-sidebar" placeholder="Buscar material..." onChange={e => setBusqueda(e.target.value)} />
            <select className="select-sidebar" onChange={e => setFiltroEdad(e.target.value)}>
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
                    <img src={m.imagen_portada} alt={m.nombre} />
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
                        <button onClick={() => descargarArchivoSeguro(m.archivo_url)} className="btn-action-fill"><FaDownload /> Descargar</button>
                      ) : (
                        <button 
                          className="btn-action-fill" 
                          onClick={() => handleComprar(m)}
                          onContextMenu={(e) => handleSimularCompra(e, m.id)}
                          disabled={cargandoPago === m.id}
                        >
                          {cargandoPago === m.id ? "..." : <><FaShoppingCart /> Comprar</>}
                        </button>
                      )}
                    </div>
                    {isAdmin && (
                      <div className="admin-bar-right">
                        <span className="sales-info-pill"><FaTag /> {m.compras?.[0]?.count || 0}</span>
                        <button className="admin-btn-edit" onClick={() => { 
                            setEditandoId(m.id); 
                            setNuevoMaterial({...m, archivo: null, portada: null, preview: null}); 
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

            <div className="oferta-box-styled">
                <label style={{display:'flex', gap:'10px', alignItems:'center', cursor:'pointer', fontWeight:'700', color:'var(--texto-cafe)'}}>
                    <input type="checkbox" checked={nuevoMaterial.en_oferta} onChange={e => setNuevoMaterial({...nuevoMaterial, en_oferta: e.target.checked})} />
                    Activar Oferta
                </label>
                {nuevoMaterial.en_oferta && (
                    <div style={{marginTop:'12px', display:'flex', alignItems:'center', gap:'10px'}}>
                        <input style={{width:'75px'}} type="number" value={nuevoMaterial.porcentaje_descuento} onChange={e => setNuevoMaterial({...nuevoMaterial, porcentaje_descuento: e.target.value})} />
                        <span style={{fontSize:'0.9rem'}}>% de descuento</span>
                    </div>
                )}
            </div>

            <div className="file-section-modal">
                <div className="file-item"><span>PDF Completo:</span><input type="file" onChange={e => setNuevoMaterial({...nuevoMaterial, archivo: e.target.files[0]})} /></div>
                <div className="file-item"><span>Imagen Portada:</span><input type="file" onChange={e => setNuevoMaterial({...nuevoMaterial, portada: e.target.files[0]})} /></div>
                <div className="file-item"><span>PDF Preview:</span><input type="file" onChange={e => setNuevoMaterial({...nuevoMaterial, preview: e.target.files[0]})} /></div>
            </div>

            <button className="btn-save-modal" disabled={subiendo}>{subiendo ? "Guardando..." : "Guardar Cambios"}</button>
            <button type="button" onClick={resetForm} className="btn-cancel-modal">Cancelar</button>
          </form>
        </div>
      )}
      
      {viewingPdf && (
        <div className="modal-overlay" onClick={() => setViewingPdf(null)}>
          <div className="pdf-modal" onClick={e => e.stopPropagation()}>
            <iframe src={`${viewingPdf}#toolbar=0`} title="Preview" />
          </div>
        </div>
      )}
    </div>
  );
}