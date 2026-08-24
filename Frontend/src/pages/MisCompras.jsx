import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabase/supabaseClient";
import Swal from 'sweetalert2'; 
import { FaDownload, FaCalendarAlt, FaEdit, FaArrowLeft, FaShoppingBag, FaEnvelope } from 'react-icons/fa';
import * as Icons from 'react-icons/fa';
import Loader from "../components/Loader";
import "./perfil.css";

export default function MisCompras() {
  const navigate = useNavigate();
  const [compras, setCompras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [enviandoId, setEnviandoId] = useState(null);
  const [usuario, setUsuario] = useState(null);

  // Estados para textos dinámicos desde contenido_mis_compras
  const [titulo, setTitulo] = useState("Mis Compras");
  const [subtitulo, setSubtitulo] = useState("Aquí tienes todos tus materiales adquiridos");
  const [iconName, setIconName] = useState("FaShoppingBag");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Obtener usuario y verificar si es Admin por ROL en la BD
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        // Verificar el rol en la tabla usuarios
        const { data: userData } = await supabase
          .from("usuarios")
          .select("rol, nombre, email")
          .eq("id", user.id)
          .single();

        if (userData?.rol === "admin") {
          setIsAdmin(true);
        }
        // El email de la sesión (auth) es siempre el real y actual; el de la
        // tabla "usuarios" es una copia que puede haber quedado desactualizada
        // -- por eso el de auth tiene prioridad, no al revés.
        setUsuario({ email: user.email || userData?.email, nombre: userData?.nombre });
      }

      // 2. Cargar Textos de la tabla contenido_mis_compras
      const { data: config } = await supabase.from("contenido_mis_compras").select("*");
      if (config) {
        config.forEach(item => {
          if (item.id === 'mc_titulo') setTitulo(item.contenido);
          if (item.id === 'mc_subtitulo') setSubtitulo(item.contenido);
          if (item.id === 'mc_icono') setIconName(item.contenido);
        });
      }

      // 3. Cargar Compras del Usuario
      if (user) {
        const { data, error } = await supabase
          .from("compras")
          .select(`id, fecha, nombre_material, precio_pagado, materiales ( archivo_url, nombre_descarga )`)
          .eq("usuario_id", user.id)
          .eq("status", "approved")
          .order('fecha', { ascending: false });
        
        if (error) throw error;
        setCompras(data || []);
      }
    } catch (error) {
      console.error("Error cargando datos:", error);
    } finally {
      setLoading(false);
    }
  };

  const editarCabecera = () => {
    // Escapado básico -- un título/subtítulo con comillas o < > rompía el
    // HTML armado a mano (la comilla cerraba el atributo antes de tiempo,
    // < > adentro del textarea se interpretaba como etiquetas).
    const escaparHtml = (texto) => (texto || "")
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    Swal.fire({
      title: 'Editar Cabecera',
      html: `
        <div class="swal-edit-container">
          <div class="swal-form-group">
            <label class="swal-label">Título</label>
            <input id="swal-titulo" class="swal-input-custom" placeholder="Título" value="${escaparHtml(titulo)}">
          </div>

          <div class="swal-form-group">
            <label class="swal-label">Subtítulo</label>
            <textarea id="swal-subtitulo" class="swal-textarea-custom" placeholder="Subtítulo">${escaparHtml(subtitulo)}</textarea>
          </div>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Guardar Cambios',
      cancelButtonText: 'Cancelar',
      width: '550px',
      preConfirm: () => ({
        titulo: document.getElementById('swal-titulo').value,
        subtitulo: document.getElementById('swal-subtitulo').value
      })
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const { error: err1 } = await supabase.from("contenido_mis_compras").update({ contenido: result.value.titulo }).eq("id", 'mc_titulo');
          if (err1) throw err1;
          const { error: err2 } = await supabase.from("contenido_mis_compras").update({ contenido: result.value.subtitulo }).eq("id", 'mc_subtitulo');
          if (err2) throw err2;
          await fetchData();
          Swal.fire({
            icon: 'success',
            title: '¡Actualizado!',
            text: 'Los cambios se guardaron correctamente',
            timer: 2000,
            showConfirmButton: false
          });
        } catch (error) {
          Swal.fire({
            icon: 'error',
            title: 'Error',
            text: 'No se pudieron guardar los cambios'
          });
        }
      }
    });
  };

  const descargarArchivo = async (urlCompleta, tituloMaterial) => {
    try {
      if (!urlCompleta) throw new Error("URL inválida");
      Swal.fire({ title: 'Descargando...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      
      const urlSinParametros = urlCompleta.split('?')[0];
      const nombreRealDelArchivo = urlSinParametros.split('/').pop();
      const { data, error } = await supabase.storage.from('materiales-privados').createSignedUrl(nombreRealDelArchivo, 60);
      
      if (error) throw error;

      const response = await fetch(data.signedUrl);
      const blob = await response.blob();
      const urlBlob = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = urlBlob;
      link.download = `${tituloMaterial.replace(/\s+/g, '_')}.pdf`;
      link.click();
      Swal.close();
    } catch (error) {
      Swal.fire("Error", "No se pudo descargar", "error");
    }
  };

  const reenviarPorCorreo = async (compra) => {
    if (!usuario?.email) return;
    setEnviandoId(compra.id);
    try {
      const { error } = await supabase.functions.invoke("notificar-compra-material", {
        body: {
          email: usuario.email,
          nombre: usuario.nombre,
          nombre_material: compra.nombre_material,
          archivo_url: compra.materiales?.archivo_url,
          nombre_descarga: compra.materiales?.nombre_descarga,
        },
      });
      if (error) throw error;
      Swal.fire({
        icon: 'success',
        title: '¡Enviado con éxito!',
        text: 'Puede tardar unos minutos en llegarte por correo.',
        confirmButtonColor: '#D48CA6',
      });
    } catch (error) {
      console.error("Error reenviando material por correo:", error);
      Swal.fire("Error", "No se pudo enviar el correo. Probá de nuevo en unos minutos.", "error");
    } finally {
      setEnviandoId(null);
    }
  };

  const eliminarCompra = async (compraId) => {
    const res = await Swal.fire({
      title: '¿Quitar esta compra de prueba?',
      text: "Vas a poder volver a comprarlo (o acreditártelo) para seguir probando.",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#D48CA6',
      confirmButtonText: 'Sí, quitar'
    });
    if (!res.isConfirmed) return;

    try {
      const { error } = await supabase.from("compras").delete().eq("id", compraId);
      if (error) throw error;
      setCompras(prev => prev.filter(c => c.id !== compraId));
      Swal.fire({ icon: 'success', title: 'Listo', timer: 1500, showConfirmButton: false });
    } catch (error) {
      console.error("Error quitando compra:", error);
      Swal.fire("Error", "No se pudo quitar la compra.", "error");
    }
  };

  const DynamicIcon = Icons[iconName] || FaShoppingBag;

  if (loading) return <div className="perfil-wrapper"><Loader /></div>;

  return (
    <div className="perfil-wrapper">
      <div className="perfil-card" style={{ maxWidth: '500px' }}>
        <button className="btn-volver" onClick={() => navigate("/")}>
          <FaArrowLeft /> Volver
        </button>

        <div className="perfil-header-simple">
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            gap: '10px',
            flexWrap: 'wrap'
          }}>
            <h2 className="perfil-title" style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <DynamicIcon /> {titulo}
            </h2>
            
            {/* BOTÓN EDITAR - Visible solo para admin */}
            {isAdmin && (
              <button onClick={editarCabecera} className="btn-editar-cabecera">
                <FaEdit size={14} /> Editar
              </button>
            )}
          </div>
          
          <p style={{ 
            fontFamily: "'Montserrat', sans-serif", 
            fontSize: '0.9rem', 
            color: '#888', 
            marginTop: '8px',
            textAlign: 'center' 
          }}>
            {subtitulo}
          </p>
        </div>

        {compras.length === 0 ? (
          <div className="empty-state">No se encontraron materiales adquiridos.</div>
        ) : (
          <div className="compras-list-container">
            {compras.map((compra) => (
              <div key={compra.id} className="compra-item">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left' }}>
                  <span style={{ fontWeight: '600', color: '#555' }}>
                    {compra.nombre_material}
                  </span>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.75rem', color: '#aaa', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <FaCalendarAlt size={10} /> {new Date(compra.fecha).toLocaleDateString()}
                    </span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-texto-oscuro)', fontWeight: 'bold' }}>
                      Importe abonado: ${compra.precio_pagado || "0"}
                    </span>
                  </div>
                </div>

                <div className="compra-item-acciones" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button
                    onClick={() => descargarArchivo(compra.materiales?.archivo_url, compra.nombre_material)}
                    className="btn-descarga"
                    title="Descargar"
                  >
                    <FaDownload />
                  </button>
                  <button
                    onClick={() => reenviarPorCorreo(compra)}
                    className="btn-descarga"
                    title="Enviar por correo"
                    disabled={enviandoId === compra.id}
                  >
                    <FaEnvelope />
                  </button>
                  {isAdmin && (
                    <button
                      onClick={() => eliminarCompra(compra.id)}
                      title="Quitar compra de prueba"
                      style={{
                        background: 'transparent',
                        border: '1.5px solid #e57373',
                        color: '#e57373',
                        borderRadius: '8px',
                        width: '38px',
                        height: '38px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer'
                      }}
                    >
                      <Icons.FaTrash size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}