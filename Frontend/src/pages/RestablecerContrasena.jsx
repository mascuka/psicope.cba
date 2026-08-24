import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../supabase/supabaseClient';
import Swal from 'sweetalert2';
import { FaLock, FaEye, FaEyeSlash } from 'react-icons/fa';
import './login.css';

// A donde llega quien clickea el link del mail de "recuperar contraseña"
// (ver handleOlvidoPassword en Login.jsx). El link trae un token en la URL
// que el cliente de Supabase lee solo (detectSessionInUrl, prendido por
// default) y arma una sesión temporal -- alcanza con esa sesión activa
// para poder cambiar la contraseña, sin pedir la vieja.
export default function RestablecerContrasena() {
  const navigate = useNavigate();
  const [verificando, setVerificando] = useState(true);
  const [listo, setListo] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const verificar = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) setListo(true);
      setVerificando(false);
    };
    verificar();

    // Por si el token todavía se está procesando cuando corre el chequeo
    // de arriba -- este evento avisa apenas la sesión de recuperación
    // queda lista.
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setListo(true);
        setVerificando(false);
      }
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 6) {
      Swal.fire('Contraseña muy corta', 'Tiene que tener al menos 6 caracteres.', 'warning');
      return;
    }
    if (password !== confirmar) {
      Swal.fire('No coinciden', 'Las dos contraseñas tienen que ser iguales.', 'warning');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      await Swal.fire({
        icon: 'success',
        title: '¡Listo!',
        text: 'Tu contraseña se actualizó. Iniciá sesión con la nueva.',
        confirmButtonColor: '#D48CA6',
      });
      await supabase.auth.signOut();
      navigate('/login');
    } catch (error) {
      console.error(error);
      // Supabase rechaza puntualmente este caso (misma contraseña que ya
      // tenía) con un mensaje en inglés que no dice nada al usuario --
      // se traduce a algo que sí explica qué pasó.
      const esMismaContrasena = /different from the old password/i.test(error.message || '');
      Swal.fire(
        esMismaContrasena ? 'Es la misma de antes' : 'Error',
        esMismaContrasena
          ? 'Elegí una contraseña distinta a la que ya tenías.'
          : 'No se pudo actualizar la contraseña. Probá pedir el link de nuevo.',
        esMismaContrasena ? 'warning' : 'error'
      );
    } finally {
      setLoading(false);
    }
  };

  if (verificando) {
    return (
      <div className="login-container">
        <div className="login-card">
          <p className="login-subtitle" style={{ textAlign: 'center' }}>Verificando el link...</p>
        </div>
      </div>
    );
  }

  if (!listo) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <h2 className="login-title">Link no válido</h2>
            <p className="login-subtitle">Este link de recuperación venció o ya se usó.</p>
          </div>
          <div className="login-footer">
            <Link to="/login" className="link-register">Volver a iniciar sesión</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h2 className="login-title">Elegí tu nueva contraseña</h2>
          <p className="login-subtitle">Escribila dos veces para confirmar</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="input-group">
            <div className="input-icon">
              <FaLock />
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Nueva contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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

          <div className="input-group">
            <div className="input-icon">
              <FaLock />
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Repetí la contraseña"
              value={confirmar}
              onChange={(e) => setConfirmar(e.target.value)}
              required
              className="login-input"
            />
          </div>

          <button type="submit" className="btn-login-primary" disabled={loading}>
            {loading ? 'Guardando...' : 'Guardar nueva contraseña'}
          </button>
        </form>
      </div>
    </div>
  );
}
