import React, { useEffect, useState } from "react";
import { supabase } from "../supabase/supabaseClient";
import { FaEdit, FaEye, FaShoppingCart, FaArrowRight, FaDownload, FaClock, FaCheckCircle, FaHeart, FaTrash, FaPlus } from 'react-icons/fa';
import Swal from 'sweetalert2';
import { Link } from "react-router-dom";
import Loader from "../components/Loader";
import Carousel from "../components/Carousel";
import { useComprarMaterial } from "../hooks/useComprarMaterial";
import "./home.css";
import "./materiales.css";

// Arcoíris pastel a color real (no monocromático como los íconos de
// react-icons, que sólo heredan un color vía currentColor).
const IconoArcoiris = () => (
  <svg data-icono="arcoiris" viewBox="0 0 24 16" xmlns="http://www.w3.org/2000/svg">
    <path d="M2 16a10 10 0 0 1 20 0" fill="none" stroke="#FFADAD" strokeWidth="2.7" strokeLinecap="round" />
    <path d="M4.6 16a7.4 7.4 0 0 1 14.8 0" fill="none" stroke="#FFD6A5" strokeWidth="2.7" strokeLinecap="round" />
    <path d="M7.2 16a4.8 4.8 0 0 1 9.6 0" fill="none" stroke="#CAFFBF" strokeWidth="2.7" strokeLinecap="round" />
    <path d="M9.8 16a2.2 2.2 0 0 1 4.4 0" fill="none" stroke="#A0C4FF" strokeWidth="2.7" strokeLinecap="round" />
  </svg>
);

export default function Home() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(null);
  const [todosLosMateriales, setTodosLosMateriales] = useState([]);
  const [viewingPdf, setViewingPdf] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [misCompras, setMisCompras] = useState([]);

  // Mismo flujo de compra real que usa Materiales.jsx (elegir método,
  // formulario de invitado, QR o Mercado Pago, espera + descarga) -- así
  // "Comprar" acá en Home hace exactamente lo mismo que en la página de
  // materiales, sin mandar a otro lado.
  const { comprar, cargandoPago } = useComprarMaterial({
    user,
    isAdmin,
    onCompraRegistrada: (materialId) => setMisCompras((prev) => [...prev, materialId]),
  });
  
  const [content, setContent] = useState({
    hero_nombre: "Brenda Grossi",
    hero_cargo: "Lic. en Psicopedagogía",
    hero_subtitulo: "Herramientas diseñadas para profesionales y familias.",
    hero_bg_url: "https://images.unsplash.com/photo-1503454537195-1dcabb73ffb9",
    problema_titulo: "¿Buscas material dinámico?",
    problema_texto: "Descubre recursos listos para descargar que facilitan el proceso de enseñanza y aprendizaje.",
    beneficios_titulo: "¿Por qué elegir nuestros materiales?",
    beneficios: [
      { icono: "FaDownload", titulo: "Descarga Inmediata", texto: "Accede a tus materiales al instante. Sin esperas, sin complicaciones." },
      { icono: "FaCheckCircle", titulo: "Calidad Garantizada", texto: "Recursos diseñados y probados por profesionales en psicopedagogía." },
      { icono: "FaHeart", titulo: "Apoyo Constante", texto: "Contenido actualizado y pensado para facilitar tu trabajo diario." },
      { icono: "Arcoiris", titulo: "Un Espacio Cálido y Creativo", texto: "Un acompañamiento cercano y colorido, pensado para que cada niño aprenda a su propio ritmo." }
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
    FaDownload, FaClock, FaCheckCircle, FaHeart, FaShoppingCart, FaEye, Arcoiris: IconoArcoiris
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

    // checkAdmin corre UNA vez al entrar a la página -- si te desloguéas
    // sin recargar (ej. desde otra pestaña, o con el botón de salir sin
    // que esta página se refresque), "isAdmin" se quedaba pegado en true
    // y los controles de edición (editar, eliminar, agregar tarjeta)
    // seguían mostrándose aunque ya no hubiera sesión. Este listener
    // reacciona al toque cuando la sesión cambia, sin depender de un
    // refresh manual.
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setUser(null);
        setIsAdmin(false);
        setMisCompras([]);
        setEditMode(null);
      } else if (event === "SIGNED_IN") {
        checkAdmin();
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const checkAdmin = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setUser(user);
      const { data } = await supabase.from("usuarios").select("rol").eq("id", user.id).single();
      setIsAdmin(data?.rol === "admin");

      const { data: compras } = await supabase.from("compras").select("material_id").eq("usuario_id", user.id).eq("status", "approved");
      if (compras) setMisCompras(compras.map(c => c.material_id));
    }
  };

  const descargarDestacado = async (item) => {
    try {
      const fileName = item.archivo_url?.includes('/') ? item.archivo_url.split('/').pop().split('?')[0] : item.archivo_url;
      if (!fileName) throw new Error("No hay archivo configurado");
      const extension = fileName.includes('.') ? fileName.split('.').pop() : 'pdf';
      const nombreLimpio = (item.nombre_descarga || item.nombre || "material").trim().replace(/[\\/:*?"<>|]/g, "").slice(0, 100);
      const { data, error } = await supabase.storage
        .from('materiales-privados')
        .createSignedUrl(fileName, 60, { download: `${nombreLimpio || "material"}.${extension}` });
      if (error) throw error;
      // Fuerza la descarga (Content-Disposition: attachment) -- se dispara
      // en esta misma pestaña, no hace falta abrir una nueva.
      window.location.href = data.signedUrl;
    } catch (error) {
      Swal.fire("Error", "No se pudo descargar el archivo.", "error");
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
    } else {
      Swal.fire('Error', 'No se pudieron guardar los cambios.', 'error');
    }
  };

  // Tarjetas de "Atención Psicopedagógica" (antes fijas en 3, solo se
  // podía editar el texto): ahora el admin puede sumar o sacar tarjetas
  // sueltas. No hay un máximo -- a partir de la 4ta, la sección entera se
  // muestra como carrusel (ver Carousel más abajo) en vez de forzar una
  // grilla cada vez más angosta.
  const agregarBeneficio = () => {
    const actualizado = {
      ...content,
      beneficios: [...content.beneficios, { icono: "FaCheckCircle", titulo: "Nueva tarjeta", texto: "Descripción breve." }],
    };
    setContent(actualizado);
    handleSave(actualizado);
    setEditMode(`beneficio_${actualizado.beneficios.length - 1}`);
  };

  const eliminarBeneficio = async (index) => {
    const confirmacion = await Swal.fire({
      title: '¿Eliminar esta tarjeta?',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#D48CA6',
    });
    if (!confirmacion.isConfirmed) return;
    const actualizado = { ...content, beneficios: content.beneficios.filter((_, i) => i !== index) };
    setContent(actualizado);
    handleSave(actualizado);
  };

 if (loading) {
  return (
    <div className="home-container">
      <Loader />
    </div>
  );
}

  return (
    <div className="home-container">
      {/* ==================== HERO ==================== */}
      <section className="home-hero" style={{ backgroundImage: `url(${content.hero_bg_url})` }}>
        <div className="hero-content">
          {editMode === 'hero' ? (
            <div className="admin-edit-card">
              <h3>Editar Portada</h3>
              <label style={{fontWeight:'700', fontSize:'0.95rem', color:'#666'}}>Nombre:</label>
              <input className="admin-input" type="text" value={content.hero_nombre} onChange={e => setContent({...content, hero_nombre: e.target.value})} />
              <label style={{fontWeight:'700', fontSize:'0.95rem', color:'#666'}}>Título profesional:</label>
              <input className="admin-input" type="text" value={content.hero_cargo} onChange={e => setContent({...content, hero_cargo: e.target.value})} />
              <label style={{fontWeight:'700', fontSize:'0.95rem', color:'#666'}}>Texto descriptivo:</label>
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
              {uploadingImage && <p style={{color: 'var(--color-acento-oscuro)', textAlign:'center'}}>Subiendo imagen...</p>}
              <div className="admin-actions" style={{display:'flex', gap:'10px', marginTop:'15px'}}>
                <button onClick={() => handleSave()} className="btn-save-admin" disabled={uploadingImage}>Guardar</button>
                <button onClick={() => setEditMode(null)} className="btn-cancel-admin">Cancelar</button>
              </div>
            </div>
          ) : (
            <>
              <h1 className="hero-titulo-doble">
                <span className="hero-nombre">{content.hero_nombre}</span>
                <span className="hero-cargo">{content.hero_cargo}</span>
              </h1>
              <p>{content.hero_subtitulo}</p>
              <Link to="/turnos" className="btn-cta-principal">Solicitar Turno</Link>
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
              {isAdmin && (
                <>
                  <button className="btn-edit-float" onClick={() => setEditMode('beneficios_titulo')} title="Editar título"><FaEdit /></button>
                  <button className="btn-edit-float" onClick={agregarBeneficio} title="Agregar tarjeta"><FaPlus /></button>
                </>
              )}
            </div>
          )}

          {(() => {
            const tarjetas = content.beneficios.map((beneficio, index) => {
              const IconComponent = iconosDisponibles[beneficio.icono] || FaCheckCircle;
              return (
                <div key={index} className="beneficio-item carousel-item">
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
                        <option value="Arcoiris">Arcoíris</option>
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
                      {beneficio.icono === "Arcoiris" ? (
                        <div className="beneficio-icono-arcoiris"><IconComponent /></div>
                      ) : (
                        <div className="beneficio-icono"><IconComponent /></div>
                      )}
                      <h4>{beneficio.titulo}</h4>
                      <p>{beneficio.texto}</p>
                      {isAdmin && (
                        <div className="beneficio-admin-acciones">
                          <button className="btn-edit-float" onClick={() => setEditMode(`beneficio_${index}`)}><FaEdit /></button>
                          <button className="btn-edit-float btn-delete-float" onClick={() => eliminarBeneficio(index)}><FaTrash /></button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            });

            // "Agregar tarjeta" vive como botón aparte, al lado del lápiz
            // de editar el título (ver arriba) -- no es contenido real de
            // la sección, así que no debe ocupar un lugar en la
            // grilla/carrusel ni contar para decidir si hace falta
            // carrusel (antes, contarla de más podía activar el carrusel
            // con solo 3 tarjetas reales, mostrando flechas para "ver más"
            // cuando lo único que había más era el propio botón de agregar).

            // Hasta 3 tarjetas entran cómodas en una grilla fija -- de ahí
            // en más, en vez de seguir angostando columnas, toda la
            // sección pasa a carrusel con flechas.
            const usarCarrusel = content.beneficios.length > 3;

            if (usarCarrusel) {
              return <Carousel ariaLabel="Atención Psicopedagógica">{tarjetas}</Carousel>;
            }
            return (
              <div
                className="beneficios-grid"
                style={{ gridTemplateColumns: `repeat(${content.beneficios.length === 4 ? 2 : Math.max(content.beneficios.length, 1)}, minmax(0, 340px))` }}
              >
                {tarjetas}
              </div>
            );
          })()}
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
                    const esGratis = Number(item.precio) === 0;
                    const precioDesc = item.en_oferta
                      ? (item.precio * (1 - item.porcentaje_descuento / 100)).toFixed(0)
                      : item.precio;

                    return (
                      <>
                        <div className="card-image-container">
                          <img src={item.imagen_portada} alt={item.nombre} />
                          {item.es_pack && (
                            <div className="oferta-badge-home ribbon-pack">Pack</div>
                          )}
                          {!item.es_pack && item.en_oferta && !esGratis && (
                            <div className="oferta-badge-home">
                              -{item.porcentaje_descuento}%
                            </div>
                          )}
                          {!item.es_pack && esGratis && (
                            <div className="oferta-badge-home ribbon-gratis">Gratis</div>
                          )}
                          {item.edad && <span className="tag-edad-home">{item.edad}</span>}
                        </div>
                        <div className="card-body">
                          <h4>{item.nombre}</h4>
                          <p>{item.descripcion || "Material psicopedagógico de calidad para potenciar el aprendizaje"}</p>

                          <div className="price-container-home">
                            <span className={`price-old-home${item.en_oferta ? "" : " price-old-home--oculto"}`}>
                              ${item.precio}
                            </span>
                            <span className="price-current-home">${item.en_oferta ? precioDesc : item.precio}</span>
                          </div>

                          <div className="home-card-actions">
                            <button className="btn-home-muestra" onClick={() => setViewingPdf(item.preview_url)} title="Ver muestra" aria-label="Ver muestra del material">
                              <FaEye />
                            </button>
                            {misCompras.includes(item.id) ? (
                              <button className="btn-home-comprar" onClick={() => descargarDestacado(item)}>
                                <FaDownload /> Descargar
                              </button>
                            ) : (
                              <button
                                className="btn-home-comprar"
                                onClick={() => comprar(item)}
                                disabled={cargandoPago === item.id}
                              >
                                {cargandoPago === item.id
                                  ? "Procesando..."
                                  : esGratis ? <><FaDownload /> Adquirir</> : <><FaShoppingCart /> Comprar</>}
                              </button>
                            )}
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