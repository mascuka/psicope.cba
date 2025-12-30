import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabase/supabaseClient";
import Swal from 'sweetalert2'; 
import { FaUser, FaCalendarAlt, FaGlobe, FaPhone, FaEnvelope, FaArrowLeft } from 'react-icons/fa';
import "./perfil.css";

export default function Perfil() {
  const navigate = useNavigate();
  const [perfil, setPerfil] = useState({ 
    nombre: "", 
    email: "", 
    telefono: "", 
    pais: "", 
    fecha_nacimiento: "" 
  });
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        const { data: perfilData, error } = await supabase
          .from("usuarios")
          .select("*")
          .eq("id", user.id)
          .single();
        
        if (perfilData) {
          setPerfil(perfilData);
        }
      }
    } catch (error) {
      console.error("Error al cargar perfil:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase.from("usuarios").update({
          email: perfil.email,
          telefono: perfil.telefono,
          pais: perfil.pais
      }).eq("id", user.id);

      if (!error) {
        setEditMode(false);
        Swal.fire({
          icon: 'success',
          title: 'Perfil actualizado',
          showConfirmButton: false,
          timer: 1500
        });
      } else {
        throw error;
      }
    } catch (error) {
      Swal.fire('Error', 'No se pudieron guardar los cambios', 'error');
    }
  };

  if (loading) return <div className="perfil-wrapper"><div className="loader-perfil">Cargando perfil...</div></div>;

  return (
    <div className="perfil-wrapper">
      <div className="perfil-card">
        <button className="btn-volver" onClick={() => navigate("/")}>
          <FaArrowLeft /> Volver
        </button>

        <div className="perfil-header-simple">
          <h2 className="perfil-title"><FaUser /> Mi Perfil</h2>
        </div>

        <div className="perfil-info-list">
          <div className="info-row">
            <label>Nombre Completo</label>
            <p>{perfil.nombre || "No disponible"}</p>
          </div>
          
          <div className="info-row">
            <label><FaCalendarAlt /> Fecha de Nacimiento</label>
            <p>{perfil.fecha_nacimiento || "No registrada"}</p>
          </div>

          <div className="info-row">
            <label><FaEnvelope /> Email</label>
            {editMode ? (
              <input 
                className="perfil-input" 
                value={perfil.email} 
                onChange={e => setPerfil({...perfil, email: e.target.value})} 
              />
            ) : (
              <p>{perfil.email}</p>
            )}
          </div>

          <div className="info-row">
            <label><FaPhone /> Teléfono</label>
            {editMode ? (
              <input 
                className="perfil-input" 
                value={perfil.telefono || ""} 
                onChange={e => setPerfil({...perfil, telefono: e.target.value})} 
              />
            ) : (
              <p>{perfil.telefono || "No registrado"}</p>
            )}
          </div>

          <div className="info-row">
            <label><FaGlobe /> País</label>
            {editMode ? (
              <input 
                className="perfil-input" 
                value={perfil.pais || ""} 
                onChange={e => setPerfil({...perfil, pais: e.target.value})} 
              />
            ) : (
              <p>{perfil.pais || "No registrado"}</p>
            )}
          </div>
        </div>

        <div className="perfil-actions">
          {editMode ? (
            <>
              <button onClick={handleUpdate} className="btn-save">Guardar</button>
              <button onClick={() => setEditMode(false)} className="btn-cancel">Cancelar</button>
            </>
          ) : (
            <button onClick={() => setEditMode(true)} className="btn-edit">Editar Datos</button>
          )}
        </div>
      </div>
    </div>
  );
}