import React, { useState } from "react";
import { useNavigate } from "react-router-dom"; 
import "./registro.css";
import TermsModal from "./TermsModal"; 
import { supabase } from '../../supabase/supabaseClient'; 
import Swal from 'sweetalert2';

export default function RegistroForm({ onSubmit }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    nombre: "",
    email: "",
    password: "",
    password2: "",
    fecha_nacimiento: "", // Corregido
    pais: "", 
    telefono: "",
  });

  const [isTermsModalOpen, setIsTermsModalOpen] = useState(false); 
  const [isTermsChecked, setIsTermsChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  
  const paises = ["Argentina", "Bolivia", "Brasil", "Chile", "Colombia", "España", "México", "Uruguay", "Otro"];

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (form.password !== form.password2) {
      Swal.fire("Error", "Las contraseñas no coinciden", "error");
      return;
    }
    
    setLoading(true);
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { nombre: form.nombre } }
    });

    if (authError) {
      Swal.fire("Error", authError.message, "error");
      setLoading(false);
      return;
    }

    const { error: dbError } = await supabase.from("usuarios").insert([
      {
        id: authData.user.id,
        nombre: form.nombre,
        email: form.email,
        fecha_nacimiento: form.fecha_nacimiento, // Corregido
        pais: form.pais,
        telefono: form.telefono,
        rol: 'user'
      }
    ]);

    if (dbError) {
      Swal.fire("Error", "Error al guardar datos de usuario", "error");
    } else {
      Swal.fire("¡Éxito!", "Cuenta creada correctamente", "success");
      if (onSubmit) onSubmit();
    }
    setLoading(false);
  };

  return (
    <div className="registro-container">
      <div className="registro-card">
        <h2 className="registro-title">Crear Cuenta</h2>
        <form onSubmit={handleRegister}>
          <div className="form-grid">
            <div className="form-group">
              <label>Nombre Completo</label>
              <input type="text" name="nombre" value={form.nombre} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label>Fecha de Nacimiento</label>
              <input type="date" name="fecha_nacimiento" value={form.fecha_nacimiento} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label>Email</label>
              <input type="email" name="email" value={form.email} onChange={handleChange} required />
            </div>
            <div className="form-group">
              <label>Teléfono</label>
              <input type="text" name="telefono" value={form.telefono} onChange={handleChange} />
            </div>
            <div className="form-group">
              <label>País</label>
              <select name="pais" value={form.pais} onChange={handleChange} required>
                <option value="">Selecciona un país</option>
                {paises.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div className="form-grid" style={{marginTop: '15px'}}>
             <div className="form-group">
               <label>Contraseña</label>
               <input type="password" name="password" value={form.password} onChange={handleChange} required />
             </div>
             <div className="form-group">
               <label>Confirmar</label>
               <input type="password" name="password2" value={form.password2} onChange={handleChange} required />
             </div>
          </div>

          <div className="terms-container">
            <input type="checkbox" checked={isTermsChecked} onChange={(e) => setIsTermsChecked(e.target.checked)} required />
            <label>Acepto los <span className="terms-link" onClick={() => setIsTermsModalOpen(true)}>términos</span></label>
          </div>

          <div className="actions">
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "Registrando..." : "Registrarme"}
            </button>
          </div>
        </form>
      </div>
      {isTermsModalOpen && <TermsModal onClose={() => setIsTermsModalOpen(false)} />}
    </div>
  );
}