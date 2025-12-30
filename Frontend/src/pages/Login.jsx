import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../supabase/supabaseClient';
import Swal from 'sweetalert2';
import { FaEnvelope, FaLock, FaEye, FaEyeSlash } from 'react-icons/fa';
import './login.css';

export default function Login() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    email: '',
    password: ''
  });

  const handleChange = (e) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value
    });
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: form.email,
        password: form.password,
      });

      if (error) throw error;

      if (data.user) {
        Swal.fire({
          title: "¡Bienvenido!",
          text: "Sesión iniciada correctamente",
          icon: "success",
          confirmButtonColor: "#e5b3a8",
          timer: 1500,
          showConfirmButton: false
        });
        navigate("/");
      }
    } catch (error) {
      console.error(error);
      Swal.fire({
        title: "Error",
        text: error.message === "Invalid login credentials" 
          ? "Credenciales incorrectas" 
          : "Hubo un problema al iniciar sesión",
        icon: "error",
        confirmButtonColor: "#e5b3a8"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h2 className="login-title">Iniciar Sesión</h2>
          <p className="login-subtitle">Bienvenido de nuevo</p>
        </div>

        <form onSubmit={handleLogin} className="login-form">
          <div className="input-group">
            <div className="input-icon">
              <FaEnvelope />
            </div>
            <input
              type="email"
              name="email"
              placeholder="Correo electrónico"
              value={form.email}
              onChange={handleChange}
              required
              className="login-input"
            />
          </div>

          <div className="input-group">
            <div className="input-icon">
              <FaLock />
            </div>
            <input
              type={showPassword ? "text" : "password"}
              name="password"
              placeholder="Contraseña"
              value={form.password}
              onChange={handleChange}
              required
              className="login-input"
            />
            <button
              type="button"
              className="toggle-password"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? <FaEyeSlash /> : <FaEye />}
            </button>
          </div>

          <button
            type="submit"
            className="btn-login-primary"
            disabled={loading}
          >
            {loading ? "Ingresando..." : "Ingresar"}
          </button>

          <div className="login-footer">
            <p>¿No tienes cuenta? <Link to="/registro" className="link-register">Regístrate aquí</Link></p>
            <Link to="/" className="link-back">Volver al inicio</Link>
          </div>
        </form>
      </div>
    </div>
  );
}