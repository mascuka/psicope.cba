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

  const handleOlvidoPassword = async () => {
    const { value: email } = await Swal.fire({
      title: "Recuperar contraseña",
      input: "email",
      inputLabel: "Ingresá el correo con el que te registraste",
      inputPlaceholder: "tu@email.com",
      showCancelButton: true,
      confirmButtonText: "Enviar",
      cancelButtonText: "Cancelar",
      confirmButtonColor: "#D48CA6",
      inputValidator: (value) => {
        if (!value) return "Ingresá tu correo";
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "El correo no es válido";
      },
    });
    if (!email) return;

    // Vía función propia (no supabase.auth.resetPasswordForEmail): esa
    // manda el mail con el remitente por defecto de Supabase
    // ("...@mail.app.supabase.io"), que no se ve profesional -- esta
    // arma el mismo link de recuperación pero lo manda con el Gmail real
    // de Brenda, mismo remitente que el resto de los mails del sitio.
    try {
      const { error } = await supabase.functions.invoke("solicitar-reset-password", {
        body: { email },
      });
      if (error) console.error("Error pidiendo reset de contraseña:", error);
    } catch (err) {
      console.error("Error pidiendo reset de contraseña:", err);
    }

    // Mensaje siempre igual, haya o no una cuenta con ese correo -- si
    // dijéramos explícito "ese correo no existe", cualquiera podría usar
    // este formulario para ir probando qué correos están registrados en
    // el sitio (enumeración de cuentas).
    Swal.fire({
      icon: "success",
      title: "Listo",
      text: "Si ese correo está registrado, te llegó un mail con un link para elegir una contraseña nueva.",
      confirmButtonColor: "#D48CA6",
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
          confirmButtonColor: "#D48CA6",
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
        confirmButtonColor: "#D48CA6"
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
            type="button"
            className="link-olvido-password"
            onClick={handleOlvidoPassword}
          >
            ¿Olvidaste tu contraseña?
          </button>

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