import React, { useEffect, useState } from "react";
import { supabase } from "../supabase/supabaseClient";
import { FaEdit, FaTrash, FaPlus, FaSearch, FaTimes, FaExternalLinkAlt, FaAngleDoubleLeft, FaAngleDoubleRight, FaSave } from 'react-icons/fa';
import Swal from 'sweetalert2';
import "./psicopedagogiando.css";

export default function Psicopedagogiando() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const postsPerPage = 4;

  const [editHeader, setEditHeader] = useState(false);
  const [headerData, setHeaderData] = useState({
    titulo: "Psicopedagogiando",
    frase: "Un espacio para aprender, compartir y crecer juntos."
  });

  const [formData, setFormData] = useState({
    tipo: 'imagen', titulo: '', contenido: '', url_media: '', link_externo: ''
  });
  const [file, setFile] = useState(null);
  const [subiendo, setSubiendo] = useState(false);

  // Función para extraer ID de YouTube de cualquier formato de URL
  const extraerYouTubeID = (url) => {
    if (!url) return '';
    
    // Si ya es solo el ID (sin URL), devolverlo tal cual
    if (url.length === 11 && !url.includes('/') && !url.includes('.')) {
      return url;
    }
    
    // Patrones para diferentes formatos de URL de YouTube (incluyendo Shorts)
    const patterns = [
      /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
      /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
      /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
      /(?:youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
      /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    ];
    
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    
    return url.trim();
  };

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase.from("usuarios").select("rol").eq("id", user.id).single();
        if (data?.rol === "admin") setIsAdmin(true);
      }
      fetchPosts();
      fetchHeader();
    };
    init();
  }, []);

  const fetchHeader = async () => {
    const { data } = await supabase.from("configuraciones").select("*").eq("clave", "psico_header").single();
    if (data) setHeaderData(data.valor);
  };

  const saveHeader = async () => {
    await supabase.from("configuraciones").upsert({ clave: "psico_header", valor: headerData });
    setEditHeader(false);
    Swal.fire({ icon: 'success', title: '¡Guardado!', showConfirmButton: false, timer: 1500 });
  };

  const fetchPosts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("psicopedagogiando")
      .select("*")
      .order("created_at", { ascending: false });
    
    if (!error) {
      setPosts(data);
      const totalP = Math.ceil(data.length / postsPerPage);
      if (currentPage > 1 && currentPage > totalP) {
        setCurrentPage(totalP || 1);
      }
    }
    setLoading(false);
  };

  const getFilePathFromUrl = (url) => {
    if (!url) return null;
    const parts = url.split('/psico/');
    return parts.length > 1 ? `psico/${parts[1]}` : null;
  };

  const handleBorrar = async (post) => {
    const res = await Swal.fire({
      title: '¿Estás seguro?',
      text: "Se borrará el post y el archivo si corresponde.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#e5b3a8',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Sí, borrar todo'
    });

    if (res.isConfirmed) {
      try {
        if (post.tipo === 'imagen' && post.url_media) {
          const path = getFilePathFromUrl(post.url_media);
          if (path) await supabase.storage.from('imagenes-web').remove([path]);
        }
        await supabase.from("psicopedagogiando").delete().eq("id", post.id);
        Swal.fire('Eliminado', 'Contenido borrado con éxito.', 'success');
        fetchPosts();
      } catch (error) {
        Swal.fire('Error', 'No se pudo eliminar.', 'error');
      }
    }
  };

  const handleSave = async () => {
    if (!formData.titulo) return Swal.fire({ 
      title: "Atención", 
      text: "El título es obligatorio", 
      icon: "warning",
      confirmButtonColor: '#e5b3a8'
    });
    
    let finalMediaUrl = formData.url_media;
    
    if (formData.tipo === 'video' && formData.url_media) {
      const videoId = extraerYouTubeID(formData.url_media);
      if (!videoId || videoId.length !== 11) {
        return Swal.fire({
          title: "Error", 
          text: "El ID o URL de YouTube no es válido. Debe tener 11 caracteres.", 
          icon: "error",
          confirmButtonColor: '#e5b3a8'
        });
      }
      finalMediaUrl = videoId;
    }
    
    setSubiendo(true);
    
    try {
      let finalUrl = finalMediaUrl;

      if (formData.tipo === 'imagen' && file) {
        if (editId && formData.url_media) {
          const oldPath = getFilePathFromUrl(formData.url_media);
          if (oldPath) await supabase.storage.from('imagenes-web').remove([oldPath]);
        }
        const fileName = `${Date.now()}_${file.name}`;
        const { error: upErr } = await supabase.storage.from('imagenes-web').upload(`psico/${fileName}`, file);
        if (upErr) throw upErr;
        const { data } = supabase.storage.from('imagenes-web').getPublicUrl(`psico/${fileName}`);
        finalUrl = data.publicUrl;
      }

      const payload = { 
        tipo: formData.tipo, 
        titulo: formData.titulo, 
        contenido: formData.contenido, 
        url_media: finalUrl, 
        link_externo: formData.link_externo || '' 
      };

      const { error } = editId 
        ? await supabase.from("psicopedagogiando").update(payload).eq("id", editId)
        : await supabase.from("psicopedagogiando").insert([payload]);

      if (error) throw error;
      
      setShowModal(false);
      setEditId(null);
      setFile(null);
      fetchPosts();
      Swal.fire({
        title: "¡Éxito!", 
        text: "Publicación guardada correctamente", 
        icon: "success",
        confirmButtonColor: '#e5b3a8'
      });
    } catch (e) {
      console.error(e);
      Swal.fire({
        title: "Error", 
        text: "No se pudo guardar. " + (e.message || ""), 
        icon: "error",
        confirmButtonColor: '#e5b3a8'
      });
    } finally {
      setSubiendo(false);
    }
  };

  const abrirLeerMas = (titulo, contenido) => {
    Swal.fire({
      title: `<span style="font-family: 'Pompiere', cursive; font-size: 2.5rem; color: #e5b3a8;">${titulo}</span>`,
      html: `<div style="font-family: 'Montserrat', sans-serif; text-align: left; line-height: 1.6; color: #555;">${contenido}</div>`,
      confirmButtonText: 'Cerrar',
      confirmButtonColor: '#e5b3a8',
    });
  };

  const postsFiltrados = posts.filter(p => p.titulo?.toLowerCase().includes(searchTerm.toLowerCase()));
  const currentPosts = postsFiltrados.slice((currentPage - 1) * postsPerPage, currentPage * postsPerPage);
  const totalPages = Math.ceil(postsFiltrados.length / postsPerPage);

    if (loading) {
      return (
        <div className="materiales-page">
          <div className="loading-container">
            <p>Cargando...</p>
          </div>
        </div>
      );
    }

  return (
    <div className="psico-page">
      <header className="psico-header-section">
        {editHeader ? (
          <div className="header-edit-box">
            <input 
              className="input-header-title" 
              value={headerData.titulo} 
              onChange={e => setHeaderData({...headerData, titulo: e.target.value})} 
              placeholder="Título principal"
            />
            <input 
              className="input-header-phrase" 
              value={headerData.frase} 
              onChange={e => setHeaderData({...headerData, frase: e.target.value})} 
              placeholder="Frase descriptiva"
            />
            <div className="header-edit-buttons">
              <button className="btn-save-header" onClick={saveHeader}>
                <FaSave /> Guardar
              </button>
              <button className="btn-cancel-header" onClick={() => {
                setEditHeader(false);
                fetchHeader();
              }}>
                <FaTimes /> Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="header-display">
            <div className="title-row">
                <h1 className="psico-main-title">{headerData.titulo}</h1>
                {isAdmin && <button className="btn-edit-header-small" onClick={() => setEditHeader(true)}><FaEdit /></button>}
            </div>
            <p className="psico-sub-phrase">{headerData.frase}</p>
          </div>
        )}

        <div className="psico-toolbar">
          <div className="psico-search">
            <FaSearch className="search-icon" />
            <input type="text" placeholder="Buscar por título..." onChange={(e) => {setSearchTerm(e.target.value); setCurrentPage(1);}} />
          </div>
          {isAdmin && (
            <button className="btn-new-psico" onClick={() => { 
                setEditId(null); 
                setFormData({tipo:'imagen', titulo:'', contenido:'', url_media:'', link_externo:''}); 
                setFile(null);
                setShowModal(true); 
            }}>
                <FaPlus /> Nuevo Post
            </button>
          )}
        </div>
      </header>

      <div className="psico-list">
        {currentPosts.map((post, index) => {
          const videoId = post.tipo === 'video' ? extraerYouTubeID(post.url_media) : null;
          
          return (
            <article key={post.id} className={`psico-item ${index % 2 !== 0 ? 'rev' : ''}`}>
              <div className="psico-visual">
                {post.tipo === 'imagen' && <img src={post.url_media} alt="" className="media-full" />}
                {post.tipo === 'video' && videoId && (
                  <div className="video-full-wrapper">
                    <iframe 
                      src={`https://www.youtube-nocookie.com/embed/${videoId}?modestbranding=1&rel=0&fs=1&controls=1&showinfo=0&iv_load_policy=3&disablekb=1`} 
                      title={post.titulo}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" 
                      allowFullScreen 
                    />
                  </div>
                )}
                {post.tipo === 'video' && !videoId && (
                  <div className="video-full-wrapper" style={{display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f9dfdf', color: '#8a5e5e'}}>
                    <p>ID de video no válido</p>
                  </div>
                )}
                {post.tipo === 'noticia' && <img src={post.url_media || 'https://via.placeholder.com/500x300?text=Noticia'} alt="" className="media-full" />}
              </div>
              
              <div className="psico-content">
                <div className="text-wrapper">
                  <h2>{post.titulo}</h2>
                  <p className="descripcion-corta">
                    {post.contenido?.length > 280 ? `${post.contenido.substring(0, 280)}...` : post.contenido}
                  </p>
                </div>

                <div className="psico-footer-card">
                  <div className="footer-btns-group">
                      {post.contenido?.length > 280 && (
                          <button className="btn-noticia-rosa btn-small" onClick={() => abrirLeerMas(post.titulo, post.contenido)}>Leer más</button>
                      )}
                      {post.tipo === 'noticia' && post.link_externo && (
                          <a href={post.link_externo} target="_blank" rel="noreferrer" className="btn-noticia-rosa btn-small">
                              Ir a la noticia <FaExternalLinkAlt />
                          </a>
                      )}
                  </div>

                  {isAdmin && (
                    <div className="admin-btns-bottom">
                      <button className="btn-edit-ps" onClick={() => {setEditId(post.id); setFormData(post); setShowModal(true);}}><FaEdit /></button>
                      <button className="btn-del-ps" onClick={() => handleBorrar(post)}><FaTrash /></button>
                    </div>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1}><FaAngleDoubleLeft /></button>
          <button onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1}>‹</button>
          
          {totalPages <= 7 ? (
            [...Array(totalPages)].map((_, i) => (
              <button key={i+1} onClick={() => setCurrentPage(i+1)} className={currentPage === i+1 ? 'active' : ''}>{i+1}</button>
            ))
          ) : (
            <>
              <button onClick={() => setCurrentPage(1)} className={currentPage === 1 ? 'active' : ''}>1</button>
              
              {currentPage > 3 && <span style={{padding: '0 10px', color: '#e5b3a8'}}>...</span>}
              
              {currentPage > 2 && currentPage < totalPages - 1 && (
                <>
                  <button onClick={() => setCurrentPage(currentPage - 1)}>{currentPage - 1}</button>
                  <button className="active">{currentPage}</button>
                  <button onClick={() => setCurrentPage(currentPage + 1)}>{currentPage + 1}</button>
                </>
              )}
              
              {currentPage === 2 && (
                <button className="active">{currentPage}</button>
              )}
              
              {currentPage === totalPages - 1 && (
                <button className="active">{currentPage}</button>
              )}
              
              {currentPage < totalPages - 2 && <span style={{padding: '0 10px', color: '#e5b3a8'}}>...</span>}
              
              <button onClick={() => setCurrentPage(totalPages)} className={currentPage === totalPages ? 'active' : ''}>{totalPages}</button>
            </>
          )}
          
          <button onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages}>›</button>
          <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}><FaAngleDoubleRight /></button>
        </div>
      )}

      {showModal && (
        <div className="modal-psico-overlay">
          <div className="modal-psico-box">
            <button className="close-x" onClick={() => setShowModal(false)}><FaTimes /></button>
            <h3 className="modal-title">{editId ? 'Editar Publicación' : 'Nueva Publicación'}</h3>
            
            <label className="modal-label">Tipo de Contenido</label>
            <select className="ps-input" value={formData.tipo} onChange={e => setFormData({...formData, tipo: e.target.value, url_media: ''})}>
              <option value="imagen">Imagen (Subir archivo)</option>
              <option value="video">YouTube (Pegar ID o URL completa)</option>
              <option value="noticia">Noticia (Links externos)</option>
            </select>

            <input className="ps-input" placeholder="Título" value={formData.titulo} onChange={e => setFormData({...formData, titulo: e.target.value})} />
            
            {formData.tipo === 'imagen' && (
                <>
                    <label className="modal-label">Elegir Imagen</label>
                    <input type="file" className="ps-input" onChange={e => setFile(e.target.files[0])} />
                </>
            )}

            {formData.tipo === 'video' && (
                <>
                  <input 
                    className="ps-input" 
                    placeholder="Pega la URL completa o solo el ID (Ej: dQw4w9WgXcQ)" 
                    value={formData.url_media} 
                    onChange={e => setFormData({...formData, url_media: e.target.value})} 
                  />
                  {formData.url_media && (
                    <p style={{fontSize: '0.8rem', color: '#666', marginTop: '-10px', marginBottom: '10px'}}>
                      ID detectado: {extraerYouTubeID(formData.url_media)}
                    </p>
                  )}
                </>
            )}

            {formData.tipo === 'noticia' && (
                <>
                    <input className="ps-input" placeholder="URL de la imagen de portada" value={formData.url_media} onChange={e => setFormData({...formData, url_media: e.target.value})} />
                    <input className="ps-input" placeholder="URL del sitio de la noticia" value={formData.link_externo} onChange={e => setFormData({...formData, link_externo: e.target.value})} />
                </>
            )}

            <textarea className="ps-area" rows="6" placeholder="Descripción o contenido..." value={formData.contenido} onChange={e => setFormData({...formData, contenido: e.target.value})} />
            
            <button className="ps-btn-main" onClick={handleSave} disabled={subiendo}>
                {subiendo ? 'Guardando...' : 'Publicar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}