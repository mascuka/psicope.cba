import React, { useEffect, useState } from "react";
import { supabase } from "../supabase/supabaseClient";
import { FaEdit, FaTrash, FaPlus, FaSearch, FaTimes, FaExternalLinkAlt, FaSave, FaPlay, FaInstagram, FaRegImage, FaNewspaper } from 'react-icons/fa';
import Swal from 'sweetalert2';
import logoImage from "../assets/logo.png";
import Loader from "../components/Loader";
import AsistenteIA from "../components/AsistenteIA";
import "./psicopedagogiando.css";

export default function Psicopedagogiando() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [postAbierto, setPostAbierto] = useState(null);
  const [arrastrandoId, setArrastrandoId] = useState(null);

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
    const { error } = await supabase.from("configuraciones").upsert({ clave: "psico_header", valor: headerData });
    if (error) return Swal.fire("Error", "No se pudo guardar el encabezado.", "error");
    setEditHeader(false);
    Swal.fire({ icon: 'success', title: '¡Guardado!', showConfirmButton: false, timer: 1500 });
  };

  const fetchPosts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("psicopedagogiando")
      .select("*")
      .order("orden", { ascending: true })
      .order("created_at", { ascending: false });

    if (!error) setPosts(data);
    setLoading(false);
  };

  // Un post nuevo entra siempre "primero" (número de orden más chico que
  // el mínimo actual), como hacía antes con created_at desc -- pero queda
  // libre para que el admin lo reordene a mano después.
  const obtenerOrdenNuevo = async () => {
    const { data } = await supabase.from("psicopedagogiando").select("orden").order("orden", { ascending: true }).limit(1);
    return data?.length ? data[0].orden - 1 : 0;
  };

  // Arrastrar y soltar para reordenar (solo admin, y solo sin búsqueda
  // activa -- con un filtro puesto, la grilla no muestra todos los posts
  // en su posición real, así que reordenar ahí sería engañoso). Reordena
  // primero en memoria (se ve al toque) y recién después guarda el nuevo
  // `orden` de cada post afectado en la base.
  const arrastreHabilitado = isAdmin && !searchTerm.trim();

  const handleDragStart = (e, postId) => {
    if (!arrastreHabilitado) return;
    setArrastrandoId(postId);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e, postId) => {
    if (!arrastreHabilitado || arrastrandoId === null || arrastrandoId === postId) return;
    e.preventDefault();
  };

  const handleDrop = async (e, destinoId) => {
    if (!arrastreHabilitado || arrastrandoId === null || arrastrandoId === destinoId) return;
    e.preventDefault();
    const origenIdx = posts.findIndex((p) => p.id === arrastrandoId);
    const destinoIdx = posts.findIndex((p) => p.id === destinoId);
    if (origenIdx === -1 || destinoIdx === -1) return;

    const reordenados = [...posts];
    const [movido] = reordenados.splice(origenIdx, 1);
    reordenados.splice(destinoIdx, 0, movido);
    setPosts(reordenados);
    setArrastrandoId(null);

    try {
      await Promise.all(reordenados.map((p, i) => supabase.from("psicopedagogiando").update({ orden: i }).eq("id", p.id)));
    } catch {
      Swal.fire("Error", "No se pudo guardar el nuevo orden.", "error");
      fetchPosts();
    }
  };

  const handleDragEnd = () => setArrastrandoId(null);

  // Supabase Storage rechaza keys con espacios, tildes u otros caracteres
  // fuera de un set chico (letras/números/._-) -- "Invalid key" pasaba con
  // nombres de archivo típicos de Windows como "Sin título.png".
  const sanitizarNombreArchivo = (nombre) => nombre
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_");

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
      confirmButtonColor: '#D48CA6',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Sí, borrar todo'
    });

    if (res.isConfirmed) {
      try {
        if ((post.tipo === 'imagen' || post.tipo === 'imagen_ia') && post.url_media) {
          const path = getFilePathFromUrl(post.url_media);
          if (path) await supabase.storage.from('imagenes-web').remove([path]);
        }
        const { error } = await supabase.from("psicopedagogiando").delete().eq("id", post.id);
        if (error) throw error;
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
      confirmButtonColor: '#D48CA6'
    });
    
    let finalMediaUrl = formData.url_media;
    
    if (formData.tipo === 'video' && formData.url_media) {
      const videoId = extraerYouTubeID(formData.url_media);
      if (!videoId || videoId.length !== 11) {
        return Swal.fire({
          title: "Error", 
          text: "El ID o URL de YouTube no es válido. Debe tener 11 caracteres.", 
          icon: "error",
          confirmButtonColor: '#D48CA6'
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
        const fileName = `${Date.now()}_${sanitizarNombreArchivo(file.name)}`;
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
        link_externo: formData.link_externo || '',
        // Sin editId (post nuevo): entra primero, como antes. Editando, se
        // omite -- undefined no viaja en el JSON, así que no toca el
        // orden que ya tenía.
        orden: editId ? undefined : await obtenerOrdenNuevo(),
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
        confirmButtonColor: '#D48CA6'
      });
    } catch (e) {
      console.error(e);
      Swal.fire({
        title: "Error", 
        text: "No se pudo guardar. " + (e.message || ""), 
        icon: "error",
        confirmButtonColor: '#D48CA6'
      });
    } finally {
      setSubiendo(false);
    }
  };

  const publicarDesdeIA = async (post) => {
    try {
      // La imagen compuesta (con el texto ya superpuesto) viene como data
      // URL -- hay que subirla a Storage antes, no guardar ese base64
      // gigante directo en la tabla.
      let urlMedia = post.imagen_url || '';
      if (post.imagen_compuesta) {
        const blob = await (await fetch(post.imagen_compuesta)).blob();
        const fileName = `${Date.now()}_ia.png`;
        const { error: upErr } = await supabase.storage.from('imagenes-web').upload(`psico/${fileName}`, blob, { contentType: 'image/png' });
        if (upErr) throw upErr;
        urlMedia = supabase.storage.from('imagenes-web').getPublicUrl(`psico/${fileName}`).data.publicUrl;
      }

      const { error } = await supabase.from("psicopedagogiando").insert([{
        // "imagen_ia": el texto ya está dibujado sobre la imagen (título y
        // texto corto), así que en la grilla/detalle no hace falta el velo
        // oscuro + título superpuesto que usan los posts tipo "imagen"
        // comunes (esos sí dependen de esa superposición para tener texto).
        tipo: 'imagen_ia',
        titulo: post.titulo,
        contenido: post.contenido,
        // El texto que el asistente dibujó arriba de la imagen (visible a
        // simple vista, pero no necesariamente igual a título/contenido) --
        // se guarda aparte para que el buscador de arriba lo encuentre.
        texto_imagen_principal: post.texto_imagen_principal || null,
        texto_imagen_secundario: post.texto_imagen_secundario || null,
        url_media: urlMedia,
        link_externo: '',
        orden: await obtenerOrdenNuevo(),
      }]);
      if (error) throw error;
      fetchPosts();
      Swal.fire({
        title: "¡Publicado!",
        text: "El posteo ya está visible en esta página.",
        icon: "success",
        confirmButtonColor: '#D48CA6'
      });
    } catch (e) {
      Swal.fire("Error", "No se pudo publicar. " + (e.message || ""), "error");
    }
  };

  const iconoTipo = (tipo) => {
    if (tipo === 'video') return <FaPlay />;
    if (tipo === 'noticia') return <FaNewspaper />;
    if (tipo === 'instagram') return <FaInstagram />;
    return <FaRegImage />;
  };

  // Antes solo miraba "titulo" -- ni "contenido" ni el texto que el
  // asistente de IA dibuja sobre la imagen (visible a simple vista) entraban
  // en la búsqueda, así que buscar una palabra que solo aparecía en la
  // imagen no encontraba nada.
  const postsFiltrados = posts.filter((p) => {
    const termino = searchTerm.trim().toLowerCase();
    if (!termino) return true;
    return [p.titulo, p.contenido, p.texto_imagen_principal, p.texto_imagen_secundario]
      .some((campo) => campo?.toLowerCase().includes(termino));
  });

    if (loading) {
      return (
        <div className="materiales-page">
          <Loader />
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
            <input type="text" placeholder="Buscar por título..." onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          {isAdmin && (
            <>
              <button className="btn-new-psico" onClick={() => {
                  setEditId(null);
                  setFormData({tipo:'imagen', titulo:'', contenido:'', url_media:'', link_externo:''});
                  setFile(null);
                  setShowModal(true);
              }}>
                  <FaPlus /> Nuevo Post
              </button>
              <AsistenteIA onPublicar={publicarDesdeIA} />
            </>
          )}
        </div>
      </header>

      {postsFiltrados.length === 0 ? (
        <p className="psico-sin-resultados">No hay publicaciones para mostrar todavía.</p>
      ) : (
        <div className="psico-grid">
          {postsFiltrados.map((post) => {
            const videoId = post.tipo === 'video' ? extraerYouTubeID(post.url_media) : null;
            const imagenMiniatura = post.tipo === 'video'
              ? (videoId ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` : null)
              : post.url_media;

            return (
              <article
                key={post.id}
                className={`psico-thumb${arrastreHabilitado ? " psico-thumb-arrastrable" : ""}${arrastrandoId === post.id ? " psico-thumb-arrastrando" : ""}`}
                draggable={arrastreHabilitado}
                onDragStart={(e) => handleDragStart(e, post.id)}
                onDragOver={(e) => handleDragOver(e, post.id)}
                onDrop={(e) => handleDrop(e, post.id)}
                onDragEnd={handleDragEnd}
                onClick={() => { if (arrastrandoId === null) setPostAbierto(post); }}
              >
                {imagenMiniatura ? (
                  <img src={imagenMiniatura} alt="" />
                ) : (
                  <div className="psico-card-media-error"><p>Sin imagen</p></div>
                )}

                {/* Los posts "imagen_ia" ya traen el título dibujado arriba
                    de la imagen, y los "imagen" comunes son una foto que
                    subió el admin tal cual -- en ninguno de los dos casos
                    hace falta el velo oscuro + título de acá abajo (eso
                    sigue existiendo para video/noticia/instagram, que no
                    tienen forma propia de mostrar de qué tratan). */}
                {post.tipo !== 'imagen_ia' && post.tipo !== 'imagen' && (
                  <>
                    <div className="psico-thumb-veil" />
                    <h4 className="psico-thumb-titulo">{post.titulo}</h4>
                  </>
                )}

                {post.tipo !== 'imagen_ia' && post.tipo !== 'imagen' && <span className="psico-thumb-type">{iconoTipo(post.tipo)}</span>}
                {post.tipo === 'instagram' && <span className="psico-card-ig-badge psico-thumb-ig"><FaInstagram /></span>}
                {post.tipo === 'video' && <span className="psico-thumb-play"><FaPlay /></span>}
              </article>
            );
          })}
        </div>
      )}

      {postAbierto && (() => {
        const post = postAbierto;
        const videoId = post.tipo === 'video' ? extraerYouTubeID(post.url_media) : null;
        const esVisual = post.tipo === 'imagen' || post.tipo === 'imagen_ia' || post.tipo === 'noticia' || post.tipo === 'instagram';

        return (
          <div className="psico-detalle-overlay" onClick={() => setPostAbierto(null)}>
            <div className="psico-detalle-box" onClick={(e) => e.stopPropagation()}>
              <button className="close-x psico-detalle-close" onClick={() => setPostAbierto(null)}><FaTimes /></button>

              <div className="psico-item-media">
                {esVisual && (
                  <img
                    src={post.url_media || 'https://via.placeholder.com/500x500?text=Sin+imagen'}
                    alt=""
                  />
                )}
                {post.tipo === 'video' && videoId && (
                  <div className="psico-video-embed">
                    <iframe
                      src={`https://www.youtube-nocookie.com/embed/${videoId}?modestbranding=1&rel=0`}
                      title={post.titulo}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                      allowFullScreen
                    />
                  </div>
                )}
                {post.tipo === 'video' && !videoId && (
                  <div className="psico-card-media-error"><p>ID de video no válido</p></div>
                )}
                {post.tipo === 'instagram' && (
                  <div className="psico-card-ig-badge"><FaInstagram /></div>
                )}
              </div>

              <div className="psico-item-body">
                <div className="psico-card-header">
                  <img src={logoImage} alt="" className="psico-card-avatar" />
                  <span className="psico-card-handle">Psicope.cba</span>
                  {post.tipo !== 'imagen' && post.tipo !== 'imagen_ia' && (
                    <span className="psico-card-type-icon">{iconoTipo(post.tipo)}</span>
                  )}
                </div>

                <h3>{post.titulo}</h3>
                <p className="psico-item-desc-full">{post.contenido}</p>

                <div className="psico-card-footer">
                  <div className="footer-btns-group">
                    {post.tipo === 'noticia' && post.link_externo && (
                      <a href={post.link_externo} target="_blank" rel="noreferrer" className="btn-noticia-rosa btn-small">
                        Ir a la noticia <FaExternalLinkAlt />
                      </a>
                    )}
                    {post.tipo === 'instagram' && post.link_externo && (
                      <a href={post.link_externo} target="_blank" rel="noreferrer" className="btn-noticia-rosa btn-small">
                        Ver en Instagram <FaInstagram />
                      </a>
                    )}
                  </div>

                  {isAdmin && (
                    <div className="admin-btns-bottom">
                      <button className="btn-edit-ps" onClick={() => {setEditId(post.id); setFormData(post); setShowModal(true); setPostAbierto(null);}}><FaEdit /></button>
                      <button className="btn-del-ps" onClick={() => {handleBorrar(post); setPostAbierto(null);}}><FaTrash /></button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

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