import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabase/supabaseClient";
import Swal from 'sweetalert2'; 
import { FaDownload, FaCalendarAlt, FaEdit, FaArrowLeft, FaShoppingBag } from 'react-icons/fa';
import * as Icons from 'react-icons/fa'; 
import "./perfil.css"; 

export default function MisCompras() {
  const navigate = useNavigate();
  const [compras, setCompras] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

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
          .select("rol")
          .eq("id", user.id)
          .single();
        
        if (userData?.rol === "admin") {
          setIsAdmin(true);
        }
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
          .select(`id, fecha, nombre_material, precio_pagado, materiales ( archivo_url )`)
          .eq("usuario_id", user.id)
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
    Swal.fire({
      title: 'Editar Cabecera',
      html: `
        <div class="swal-edit-container">
          <div class="swal-form-group">
            <label class="swal-label">Título</label>
            <input id="swal-titulo" class="swal-input-custom" placeholder="Título" value="${titulo}">
          </div>
          
          <div class="swal-form-group">
            <label class="swal-label">Subtítulo</label>
            <textarea id="swal-subtitulo" class="swal-textarea-custom" placeholder="Subtítulo">${subtitulo}</textarea>
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
          await supabase.from("contenido_mis_compras").update({ contenido: result.value.titulo }).eq("id", 'mc_titulo');
          await supabase.from("contenido_mis_compras").update({ contenido: result.value.subtitulo }).eq("id", 'mc_subtitulo');
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

  const DynamicIcon = Icons[iconName] || FaShoppingBag;

  if (loading) return <div className="perfil-wrapper"><div className="loader-perfil">Cargando...</div></div>;

  return (
    <div className="perfil-wrapper">
      <div className="perfil-card" style={{ maxWidth: '500px' }}>
        <button className="btn-volver" onClick={() => navigate("/")}>
          <FaArrowLeft /> Volver
        </button>

        <div className="perfil-header-simple" style={{ marginTop: '20px' }}>
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
              <button 
                onClick={editarCabecera} 
                style={{ 
                  background: '#e5b3a8', 
                  border: 'none', 
                  color: 'white',
                  cursor: 'pointer',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.85rem',
                  fontWeight: '500',
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => e.target.style.background = '#d49b8f'}
                onMouseLeave={(e) => e.target.style.background = '#e5b3a8'}
              >
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
                    <span style={{ fontSize: '0.75rem', color: '#e5b3a8', fontWeight: 'bold' }}>
                      Importe abonado: ${compra.precio_pagado || "0"}
                    </span>
                  </div>
                </div>

                <button 
                  onClick={() => descargarArchivo(compra.materiales?.archivo_url, compra.nombre_material)}
                  className="btn-descarga"
                >
                  <FaDownload />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}