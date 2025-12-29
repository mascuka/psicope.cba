import React, { useEffect, useState } from "react";
import { supabase } from "../supabase/supabaseClient";
import Swal from 'sweetalert2'; 
import { FaDownload, FaShoppingBag } from 'react-icons/fa';
import "./perfil.css"; // Reutilizamos estilos de tarjetas o puedes crear misCompras.css

export default function MisCompras() {
  const [compras, setCompras] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCompras();
  }, []);

  const fetchCompras = async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data, error } = await supabase
        .from("compras")
        .select(`
          id,
          materiales (
            nombre,
            archivo_url
          )
        `)
        .eq("usuario_id", user.id);
      
      if (!error) setCompras(data);
    }
    setLoading(false);
  };

  const descargarArchivo = async (url, nombre) => {
    try {
      Swal.fire({ title: 'Preparando descarga...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      const response = await fetch(url);
      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.download = `${nombre}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      Swal.close();
    } catch (error) {
      Swal.close();
      window.open(url, '_blank');
    }
  };

  if (loading) return <div className="perfil-wrapper">Cargando tus compras...</div>;

  return (
    <div className="perfil-wrapper">
      <div className="perfil-card">
        <div className="perfil-header-simple">
          <h2 className="perfil-title"><FaShoppingBag /> Mis Compras</h2>
          <p className="perfil-subtitle">Aquí tienes todos tus materiales adquiridos</p>
        </div>

        {compras.length === 0 ? (
          <p style={{textAlign: 'center', color: '#888', padding: '20px'}}>Aún no has realizado ninguna compra.</p>
        ) : (
          <div className="compras-list-container" style={{display: 'flex', flexDirection: 'column', gap: '15px', marginTop: '20px'}}>
            {compras.map((compra) => (
              <div key={compra.id} className="compra-item" style={{
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center', 
                padding: '15px', 
                border: '1px solid #f9dfdf', 
                borderRadius: '12px',
                background: '#fffaff'
              }}>
                <span style={{fontWeight: '600', color: '#444'}}>{compra.materiales?.nombre}</span>
                <button 
                  onClick={() => descargarArchivo(compra.materiales?.archivo_url, compra.materiales?.nombre)}
                  className="btn-descarga"
                  style={{
                    backgroundColor: '#e5b3a8',
                    color: 'white',
                    border: 'none',
                    padding: '8px 15px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                >
                  <FaDownload /> Descargar PDF
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}