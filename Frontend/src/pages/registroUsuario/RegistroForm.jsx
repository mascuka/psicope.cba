import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from "../../supabase/supabaseClient";
import Swal from 'sweetalert2';
import { FaEye, FaEyeSlash } from 'react-icons/fa';
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
  const [verPassword, setVerPassword] = useState(false);

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
        confirmButtonColor: "#D48CA6"
      });
      return;
    }

    // Validar que los campos obligatorios estén llenos
    if (!form.nombre || !form.email || !form.fecha_nacimiento || !form.pais) {
      Swal.fire({
        title: "Campos incompletos",
        text: "Por favor completa todos los campos obligatorios",
        icon: "warning",
        confirmButtonColor: "#D48CA6"
      });
      return;
    }

    setLoading(true);
    
    try {
      // La cuenta la crea la función del servidor: así el mail de
      // confirmación sale del Gmail de Brenda (no de supabase.io, en
      // inglés) y el perfil lo arma la base sola, sin depender de que haya
      // sesión (no la hay hasta confirmar el email).
      const { error } = await supabase.functions.invoke("registrar-usuario", {
        body: {
          nombre: form.nombre,
          email: form.email,
          password: form.password,
          fecha_nacimiento: form.fecha_nacimiento,
          pais: form.pais,
          telefono: form.telefono || null,
        },
      });

      if (error) {
        let mensaje = null;
        try { mensaje = (await error.context.json()).error; } catch { /* sin detalle */ }
        throw new Error(mensaje || "Hubo un problema al crear la cuenta. Probá de nuevo en unos minutos.");
      }

      Swal.fire({
        title: "¡Cuenta creada!",
        text: `Te mandamos un mail a ${form.email} para confirmarla. Revisá también la carpeta de spam.`,
        icon: "success",
        confirmButtonColor: "#D48CA6"
      });
      navigate("/login");
    } catch (error) {
      console.error("Error al registrar:", error);
      Swal.fire({
        title: "Error",
        text: error.message,
        icon: "error",
        confirmButtonColor: "#D48CA6"
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
               <div className="password-campo">
                 <input type={verPassword ? "text" : "password"} name="password" value={form.password} onChange={handleChange} required minLength={6} placeholder="Mínimo 6 caracteres" />
                 <button type="button" className="password-ojo" onClick={() => setVerPassword(v => !v)} aria-label={verPassword ? "Ocultar contraseña" : "Mostrar contraseña"}>
                   {verPassword ? <FaEyeSlash /> : <FaEye />}
                 </button>
               </div>
             </div>
             <div className="form-group">
               <label>Repetir</label>
               <div className="password-campo">
                 <input
                   type={verPassword ? "text" : "password"}
                   name="password2"
                   value={form.password2}
                   onChange={handleChange}
                   required
                   className={form.password2 ? (form.password2 === form.password ? "input-ok" : "input-error") : ""}
                 />
                 <button type="button" className="password-ojo" onClick={() => setVerPassword(v => !v)} aria-label={verPassword ? "Ocultar contraseña" : "Mostrar contraseña"}>
                   {verPassword ? <FaEyeSlash /> : <FaEye />}
                 </button>
               </div>
               {form.password2 && (
                 form.password2 === form.password
                   ? <span className="password-aviso ok">✓ Coinciden</span>
                   : <span className="password-aviso error">No coinciden</span>
               )}
             </div>
          </div>

          <div className="terms-container">
            <input id="acepto-terminos" type="checkbox" checked={isTermsChecked} onChange={(e) => setIsTermsChecked(e.target.checked)} required />
            <label htmlFor="acepto-terminos">Acepto los <strong className="terms-link" onClick={(e) => { e.preventDefault(); setIsTermsModalOpen(true); }}>términos</strong></label>
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
      {isTermsModalOpen && (
        <TermsModal
          onClose={() => setIsTermsModalOpen(false)}
          onAceptar={() => { setIsTermsChecked(true); setIsTermsModalOpen(false); }}
        />
      )}
    </div>
  );
}