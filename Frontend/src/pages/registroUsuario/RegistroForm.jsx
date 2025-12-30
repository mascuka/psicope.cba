import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from "../../supabase/supabaseClient";
import Swal from 'sweetalert2';
import TermsModal from './TermsModal';
import './registro.css';

const paises = [
  'Argentina', 'Bolivia', 'Brasil', 'Chile', 'Colombia', 
  'Costa Rica', 'Cuba', 'Ecuador', 'El Salvador', 'España',
  'Guatemala', 'Honduras', 'México', 'Nicaragua', 'Panamá',
  'Paraguay', 'Perú', 'República Dominicana', 'Uruguay', 
  'Venezuela', 'Otro'
];

export default function RegistroForm() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [isTermsChecked, setIsTermsChecked] = useState(false);
  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);

  const [form, setForm] = useState({
    nombre: '',
    email: '',
    fecha_nacimiento: '',
    pais: '',
    telefono: '',
    password: '',
    password2: ''
  });

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value
    });
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    
    // Validar contraseñas
    if (form.password !== form.password2) {
      Swal.fire({
        title: "Error",
        text: "Las contraseñas no coinciden",
        icon: "error",
        confirmButtonColor: "#e5b3a8"
      });
      return;
    }

    // Validar que los campos obligatorios estén llenos
    if (!form.nombre || !form.email || !form.fecha_nacimiento || !form.pais) {
      Swal.fire({
        title: "Campos incompletos",
        text: "Por favor completa todos los campos obligatorios",
        icon: "warning",
        confirmButtonColor: "#e5b3a8"
      });
      return;
    }

    setLoading(true);
    
    try {
      console.log("📝 Intentando registrar usuario con datos:", {
        nombre: form.nombre,
        email: form.email,
        fecha_nacimiento: form.fecha_nacimiento,
        pais: form.pais,
        telefono: form.telefono
      });

      // 1. Crear usuario en Auth con metadata
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            nombre: form.nombre,
            pais: form.pais,
            fecha_nacimiento: form.fecha_nacimiento
          }
        }
      });

      if (authError) {
        console.error("❌ Error en Auth:", authError);
        throw authError;
      }

      console.log("✅ Usuario creado en Auth:", authData.user.id);

      // 2. Insertar datos en la tabla usuarios
      if (authData.user) {
        const userData = {
          id: authData.user.id,
          nombre: form.nombre,
          email: form.email,
          fecha_nacimiento: form.fecha_nacimiento,
          pais: form.pais,
          telefono: form.telefono || null,
          rol: 'normal'
        };

        console.log("📤 Insertando en tabla usuarios:", userData);

        const { data: insertData, error: profileError } = await supabase
          .from("usuarios")
          .insert([userData])
          .select();

        if (profileError) {
          console.error("❌ Error al insertar perfil:", profileError);
          throw profileError;
        }

        console.log("✅ Perfil insertado exitosamente:", insertData);

        Swal.fire({
          title: "¡Cuenta creada!",
          text: "Confirma tu email para ingresar.",
          icon: "success",
          confirmButtonColor: "#e5b3a8"
        });
        navigate("/login");
      }
    } catch (error) {
      console.error("❌ Error completo:", error);
      
      let mensajeError = "Hubo un problema al guardar tus datos.";
      
      if (error.message?.includes("duplicate key")) {
        mensajeError = "Este correo ya está registrado.";
      } else if (error.message) {
        mensajeError += ` Detalle: ${error.message}`;
      }
      
      Swal.fire({
        title: "Error",
        text: mensajeError,
        icon: "error",
        confirmButtonColor: "#e5b3a8"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="registro-container">
      <div className="registro-card">
        <h2 className="registro-title">Registrarme</h2>
        
        <form onSubmit={handleRegister}>
          <div className="form-group">
            <label>Nombre y Apellido</label>
            <input type="text" name="nombre" value={form.nombre} onChange={handleChange} required placeholder="Ej: María García" />
          </div>

          <div className="form-group">
            <label>Correo Electrónico</label>
            <input type="email" name="email" value={form.email} onChange={handleChange} required placeholder="email@ejemplo.com" />
          </div>

          <div className="form-grid-custom">
            <div className="form-group">
              <label>Fecha Nac.</label>
              <input type="date" name="fecha_nacimiento" value={form.fecha_nacimiento} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label>País</label>
              <select name="pais" value={form.pais} onChange={handleChange} required>
                <option value="">Seleccionar...</option>
                {paises.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Teléfono</label>
            <input type="tel" name="telefono" value={form.telefono} onChange={handleChange} placeholder="+54 9..." />
          </div>

          <div className="form-grid-custom">
             <div className="form-group">
               <label>Contraseña</label>
               <input type="password" name="password" value={form.password} onChange={handleChange} required />
             </div>
             <div className="form-group">
               <label>Repetir</label>
               <input type="password" name="password2" value={form.password2} onChange={handleChange} required />
             </div>
          </div>

          <div className="terms-container">
            <input type="checkbox" checked={isTermsChecked} onChange={(e) => setIsTermsChecked(e.target.checked)} required />
            <span>Acepto los <strong className="terms-link" onClick={() => setIsTermsModalOpen(true)}>términos</strong></span>
          </div>

          <div className="registro-actions">
            <button type="submit" className="btn-primary-reg" disabled={loading || !isTermsChecked}>
              {loading ? "Procesando..." : "Crear Cuenta"}
            </button>
            <button type="button" className="btn-cancel-reg" onClick={() => navigate("/")}>
              Cancelar y volver
            </button>
          </div>
        </form>
      </div>
      {isTermsModalOpen && <TermsModal onClose={() => setIsTermsModalOpen(false)} />}
    </div>
  );
}