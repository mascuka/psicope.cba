import React, { useEffect, useState } from "react";
import { supabase } from "../supabase/supabaseClient";
import { FaEdit, FaEye, FaShoppingCart, FaArrowRight, FaDownload, FaClock, FaCheckCircle, FaHeart } from 'react-icons/fa';
import Swal from 'sweetalert2';
import { Link } from "react-router-dom";
import "./home.css";

export default function Home() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(null); 
  const [todosLosMateriales, setTodosLosMateriales] = useState([]);
  const [viewingPdf, setViewingPdf] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  
  const [content, setContent] = useState({
    hero_titulo: "Recursos Psicopedagógicos para potenciar el aprendizaje",
    hero_subtitulo: "Herramientas diseñadas para profesionales y familias.",
    hero_bg_url: "https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9",
    problema_titulo: "¿Buscas material dinámico?",
    problema_texto: "Descubre recursos listos para descargar que facilitan el proceso de enseñanza y aprendizaje.",
    beneficios_titulo: "¿Por qué elegir nuestros materiales?",
    beneficios: [
      { icono: "FaDownload", titulo: "Descarga Inmediata", texto: "Accede a tus materiales al instante. Sin esperas, sin complicaciones." },
      { icono: "FaCheckCircle", titulo: "Calidad Garantizada", texto: "Recursos diseñados y probados por profesionales en psicopedagogía." },
      { icono: "FaHeart", titulo: "Apoyo Constante", texto: "Contenido actualizado y pensado para facilitar tu trabajo diario." }
    ],
    destacados_titulo: "Materiales Destacados",
    destacados_subtitulo: "Recursos cuidadosamente seleccionados para cada etapa del aprendizaje",
    frase_ver_todos: "¿Listo para potenciar tu práctica educativa?",
    config_destacados: [
      { id: null, modo: "automatico" }, 
      { id: null, modo: "automatico" }, 
      { id: null, modo: "automatico" }
    ]
  });

  const [destacados, setDestacados] = useState([]);

  const iconosDisponibles = {
    FaDownload, FaClock, FaCheckCircle, FaHeart, FaShoppingCart, FaEye
  };

  useEffect(() => {
    const inicializar = async () => {
      await checkAdmin();
      await fetchHomeContent();
      const { data } = await supabase.from("materiales").select("id, nombre");
      setTodosLosMateriales(data || []);
      setLoading(false);
    };
    inicializar();
  }, []);

  const checkAdmin = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from("usuarios").select("rol").eq("id", user.id).single();
      if (data?.rol === "admin") setIsAdmin(true);
    }
  };

  const fetchHomeContent = async () => {
    const { data } = await supabase.from("contenido_home").select("valores").eq("seccion", "principal").single();
    if (data) {
      const mergedContent = { ...content, ...data.valores };
      setContent(mergedContent);
      await procesarDestacados(mergedContent.config_destacados);
    } else {
      await procesarDestacados(content.config_destacados);
    }
  };

  const procesarDestacados = async (configArr) => {
    // Traemos también los campos de oferta y precio
    const { data: recientes } = await supabase.from("materiales")
      .select("*, en_oferta, precio, porcentaje_descuento")
      .order("created_at", { ascending: false })
      .limit(3);

    const promesas = configArr.slice(0, 3).map(async (config, index) => {
      if (config.modo === "manual" && config.id) {
        const { data } = await supabase.from("materiales")
          .select("*, en_oferta, precio, porcentaje_descuento")
          .eq("id", config.id).single();
        return data || recientes[index];
      }
      return recientes[index];
    });

    const resultados = await Promise.all(promesas);
    setDestacados(resultados.filter(item => item !== null));
  };

  const handleImageUpload = async (file) => {
    if (!file) return null;
    setUploadingImage(true);
    try {
      if (content.hero_bg_url && content.hero_bg_url.includes('supabase')) {
        const oldPath = content.hero_bg_url.split('/').pop();
        await supabase.storage.from('materiales-didacticos').remove([`hero/${oldPath}`]);
      }
      const fileName = `hero_${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('materiales-didacticos')
        .upload(`hero/${fileName}`, file);

      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from('materiales-didacticos').getPublicUrl(`hero/${fileName}`);
      setUploadingImage(false);
      return data.publicUrl;
    } catch (error) {
      setUploadingImage(false);
      Swal.fire('Error', 'No se pudo subir la imagen', 'error');
      return null;
    }
  };

  const handleSave = async (nuevoContenido = content) => {
    const { error } = await supabase
      .from("contenido_home")
      .upsert({ seccion: "principal", valores: nuevoContenido }, { onConflict: 'seccion' });

    if (!error) {
      setEditMode(null);
      Swal.fire({ icon: 'success', title: 'Guardado', showConfirmButton: false, timer: 1500 });
      procesarDestacados(nuevoContenido.config_destacados);
    }
  };

  if (loading) return <div style={{display:'flex', justifyContent:'center', alignItems:'center', height:'100vh', fontSize:'2rem', color:'#e5b3a8'}}>Cargando...</div>;

  return (
    <div className="home-container">
      {/* ==================== HERO ==================== */}
      <section className="home-hero" style={{ backgroundImage: `url(${content.hero_bg_url})` }}>
        <div className="hero-content">
          {editMode === 'hero' ? (
            <div className="admin-edit-card">
              <h3>Editar Portada</h3>
              <textarea className="admin-input" rows="2" value={content.hero_titulo} onChange={e => setContent({...content, hero_titulo: e.target.value})} />
              <textarea className="admin-textarea" value={content.hero_subtitulo} onChange={e => setContent({...content, hero_subtitulo: e.target.value})} />
              <label style={{fontWeight:'700', fontSize:'1.2rem', marginTop:'10px'}}>Imagen de Fondo:</label>
              <input 
                type="file" 
                accept="image/*"
                className="admin-file-input" 
                onChange={async (e) => {
                  const file = e.target.files[0];
                  if (file) {
                    const url = await handleImageUpload(file);
                    if (url) setContent({...content, hero_bg_url: url});
                  }
                }}
              />
              {uploadingImage && <p style={{color: 'var(--rosa)', textAlign:'center'}}>Subiendo imagen...</p>}
              <div className="admin-actions" style={{display:'flex', gap:'10px', marginTop:'15px'}}>
                <button onClick={() => handleSave()} className="btn-save-admin" disabled={uploadingImage}>Guardar</button>
                <button onClick={() => setEditMode(null)} className="btn-cancel-admin">Cancelar</button>
              </div>
            </div>
          ) : (
            <>
              <h1>{content.hero_titulo}</h1>
              <p>{content.hero_subtitulo}</p>
              <Link to="/materiales" className="btn-cta-principal">Ver Materiales</Link>
              {isAdmin && <button className="btn-edit-float" style={{position:'absolute', top:'20px', right:'20px'}} onClick={() => setEditMode('hero')}><FaEdit /></button>}
            </>
          )}
        </div>
      </section>

      {/* ==================== BENEFICIOS ==================== */}
      <section className="home-beneficios">
        <div className="beneficios-container">
          {editMode === 'beneficios_titulo' ? (
            <div className="admin-edit-card" style={{maxWidth:'600px', margin:'0 auto 50px'}}>
              <input className="admin-input" value={content.beneficios_titulo} onChange={e => setContent({...content, beneficios_titulo: e.target.value})} />
              <div style={{display:'flex', gap:'10px'}}>
                <button onClick={() => handleSave()} className="btn-save-admin">Ok</button>
                <button onClick={() => setEditMode(null)} className="btn-cancel-admin">X</button>
              </div>
            </div>
          ) : (
            <div style={{display:'flex', justifyContent:'center', alignItems:'center', gap:'15px', marginBottom:'70px'}}>
              <h2 className="beneficios-titulo">{content.beneficios_titulo}</h2>
              {isAdmin && <button className="btn-edit-float" onClick={() => setEditMode('beneficios_titulo')}><FaEdit /></button>}
            </div>
          )}

          <div className="beneficios-grid">
            {content.beneficios.map((beneficio, index) => {
              const IconComponent = iconosDisponibles[beneficio.icono] || FaCheckCircle;
              return (
                <div key={index} className="beneficio-item">
                  {editMode === `beneficio_${index}` ? (
                    <div style={{padding:'10px'}}>
                      <select className="admin-input" value={beneficio.icono} onChange={e => {
                        const newBeneficios = [...content.beneficios];
                        newBeneficios[index].icono = e.target.value;
                        setContent({...content, beneficios: newBeneficios});
                      }}>
                        <option value="FaDownload">Descarga</option>
                        <option value="FaCheckCircle">Check</option>
                        <option value="FaHeart">Corazón</option>
                        <option value="FaClock">Reloj</option>
                        <option value="FaEye">Ojo</option>
                      </select>
                      <input className="admin-input" value={beneficio.titulo} onChange={e => {
                        const newBeneficios = [...content.beneficios];
                        newBeneficios[index].titulo = e.target.value;
                        setContent({...content, beneficios: newBeneficios});
                      }} />
                      <textarea className="admin-textarea" value={beneficio.texto} onChange={e => {
                        const newBeneficios = [...content.beneficios];
                        newBeneficios[index].texto = e.target.value;
                        setContent({...content, beneficios: newBeneficios});
                      }} />
                      <div style={{display:'flex', gap:'8px', marginTop:'10px'}}>
                        <button onClick={() => handleSave()} className="btn-save-admin">✓</button>
                        <button onClick={() => setEditMode(null)} className="btn-cancel-admin">✕</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="beneficio-icono"><IconComponent /></div>
                      <h4>{beneficio.titulo}</h4>
                      <p>{beneficio.texto}</p>
                      {isAdmin && <button className="btn-edit-float" style={{position:'absolute', top:'10px', right:'10px'}} onClick={() => setEditMode(`beneficio_${index}`)}><FaEdit /></button>}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ==================== INFO ==================== */}
      <section className="home-info">
        <div className="info-card">
          {editMode === 'problema' ? (
            <div className="admin-edit-card">
              <h3>Editar Información</h3>
              <input className="admin-input" value={content.problema_titulo} onChange={e => setContent({...content, problema_titulo: e.target.value})} />
              <textarea className="admin-textarea" value={content.problema_texto} onChange={e => setContent({...content, problema_texto: e.target.value})} />
              <div className="admin-actions" style={{display:'flex', gap:'10px'}}>
                <button onClick={() => handleSave()} className="btn-save-admin">Guardar</button>
                <button onClick={() => setEditMode(null)} className="btn-cancel-admin">Cancelar</button>
              </div>
            </div>
          ) : (
            <>
              <h2>{content.problema_titulo}</h2>
              <p>{content.problema_texto}</p>
              {isAdmin && <button className="btn-edit-float" style={{position:'absolute', top:'20px', right:'20px'}} onClick={() => setEditMode('problema')}><FaEdit /></button>}
            </>
          )}
        </div>
      </section>

      {/* ==================== DESTACADOS ==================== */}
      <section className="home-destacados">
        <div className="destacados-header">
          {editMode === 'titulo_destacados' ? (
            <div className="admin-edit-card" style={{ maxWidth: '700px', margin: '0 auto' }}>
              <input className="admin-input" placeholder="Título principal" value={content.destacados_titulo} onChange={e => setContent({...content, destacados_titulo: e.target.value})} />
              <input className="admin-input" placeholder="Subtítulo" value={content.destacados_subtitulo} onChange={e => setContent({...content, destacados_subtitulo: e.target.value})} />
              <div className="admin-actions" style={{display:'flex', gap:'10px'}}>
                <button onClick={() => handleSave()} className="btn-save-admin">Guardar</button>
                <button onClick={() => setEditMode(null)} className="btn-cancel-admin">Cancelar</button>
              </div>
            </div>
          ) : (
            <>
              <div style={{display:'flex', justifyContent:'center', alignItems:'center', gap:'15px'}}>
                <h3>{content.destacados_titulo || "Materiales Destacados"}</h3>
                {isAdmin && <button className="btn-edit-float" onClick={() => setEditMode('titulo_destacados')}><FaEdit /></button>}
              </div>
              <p className="destacados-subtitulo">{content.destacados_subtitulo}</p>
            </>
          )}
        </div>

        <div className="destacados-grid">
          {[0, 1, 2].map((index) => {
            const item = destacados[index];
            return (
              <div key={index} className="material-card">
                {isAdmin && !editMode?.startsWith('config_') && (
                  <button className="btn-edit-float" style={{position:'absolute', top:'15px', right:'15px', zIndex: 10}} onClick={() => setEditMode(`config_${index}`)}>
                    <FaEdit />
                  </button>
                )}

                {editMode === `config_${index}` ? (
                  <div className="admin-edit-card" style={{ padding: '25px', margin: '20px', border:'none', boxShadow:'0 10px 30px rgba(0,0,0,0.1)' }}>
                    <label style={{fontWeight:'700', marginBottom:'8px', display:'block'}}>Configurar Slot {index + 1}:</label>
                    <select className="admin-input" value={content.config_destacados[index].modo} onChange={e => {
                        const nc = [...content.config_destacados]; nc[index].modo = e.target.value;
                        setContent({...content, config_destacados: nc});
                    }}>
                      <option value="automatico">Automático (más reciente)</option>
                      <option value="manual">Seleccionar manualmente</option>
                    </select>
                    {content.config_destacados[index].modo === 'manual' && (
                      <select className="admin-input" value={content.config_destacados[index].id || ""} onChange={e => {
                        const nc = [...content.config_destacados]; nc[index].id = e.target.value;
                        setContent({...content, config_destacados: nc});
                      }}>
                        <option value="">Elegir Material...</option>
                        {todosLosMateriales.map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
                      </select>
                    )}
                    <div className="admin-actions" style={{display:'flex', gap:'10px', marginTop:'15px'}}>
                        <button onClick={() => handleSave()} className="btn-save-admin">Aplicar</button>
                        <button onClick={() => setEditMode(null)} className="btn-cancel-admin">Cancelar</button>
                    </div>
                  </div>
                ) : (
                  item && (() => {
                    const precioDesc = item.en_oferta 
                      ? (item.precio * (1 - item.porcentaje_descuento / 100)).toFixed(0) 
                      : item.precio;

                    return (
                      <>
                        <div className="card-image-container">
                          <img src={item.imagen_portada} alt={item.nombre} />
                          {item.en_oferta && (
                            <div className="oferta-badge-home">
                              -{item.porcentaje_descuento}%
                            </div>
                          )}
                        </div>
                        <div className="card-body">
                          <h4>{item.nombre}</h4>
                          <p>{item.descripcion || "Material psicopedagógico de calidad para potenciar el aprendizaje"}</p>
                          
                          <div className="price-container-home">
                            {item.en_oferta ? (
                              <>
                                <span className="price-old-home">${item.precio}</span>
                                <span className="price-current-home">${precioDesc}</span>
                              </>
                            ) : (
                              <span className="price-current-home">${item.precio}</span>
                            )}
                          </div>

                          <div className="home-card-actions">
                            <button className="btn-home-muestra" onClick={() => setViewingPdf(item.preview_url)}>
                              <FaEye /> Muestra
                            </button>
                            <Link to="/materiales" className="btn-home-comprar">
                              <FaShoppingCart /> Comprar
                            </Link>
                          </div>
                        </div>
                      </>
                    );
                  })()
                )}
              </div>
            );
          })}
        </div>

        {/* FRASE Y BOTÓN VER TODOS */}
        <div className="ver-todo-seccion">
          {editMode === 'frase_ver_todos' ? (
            <div style={{padding:'20px'}}>
              <textarea className="admin-textarea" rows="2" value={content.frase_ver_todos} onChange={e => setContent({...content, frase_ver_todos: e.target.value})} />
              <div style={{display:'flex', gap:'10px', marginTop:'15px', justifyContent:'center'}}>
                <button onClick={() => handleSave()} className="btn-save-admin">Guardar</button>
                <button onClick={() => setEditMode(null)} className="btn-cancel-admin">Cancelar</button>
              </div>
            </div>
          ) : (
            <>
              <div style={{display:'flex', justifyContent:'center', alignItems:'center', gap:'12px', marginBottom:'35px'}}>
                <p className="frase-motivadora">{content.frase_ver_todos}</p>
                {isAdmin && <button className="btn-edit-float" onClick={() => setEditMode('frase_ver_todos')}><FaEdit /></button>}
              </div>
              <Link to="/materiales" className="btn-ver-todo">
                Ver todos los materiales <FaArrowRight />
              </Link>
            </>
          )}
        </div>
      </section>

      {/* ==================== MODAL PDF ==================== */}
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