// src/pages/Login.jsx
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
// Importación corregida con llaves { }
import { supabase } from "../supabase/supabaseClient";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mensaje, setMensaje] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setMensaje("Cargando...");

    // MÉTODO CORRECTO: Usamos signInWithPassword de Supabase Auth
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (error) {
      // Si hay error (datos incorrectos o mail no verificado)
      setMensaje("⚠️ " + error.message);
    } else {
      setMensaje(`✅ Bienvenido de nuevo`);
      
      // Esperamos un segundo para que vea el mensaje y redirigimos al Home
      setTimeout(() => {
        navigate("/");
      }, 1000);
    }
  };

  return (
    <div className="registro-container"> {/* Reutilizo tu clase de registro para que se vea centrado */}
      <div className="registro-card">
        <h2 className="registro-title">Iniciar Sesión</h2>
        
        <form onSubmit={handleLogin} className="registro-form">
          <div className="form-group" style={{ marginBottom: "15px" }}>
            <label>Email:</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              required
            />
          </div>

          <div className="form-group" style={{ marginBottom: "15px" }}>
            <label>Contraseña:</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          {mensaje && (
            <p style={{ 
              color: mensaje.includes("✅") ? "green" : "red", 
              fontSize: "0.9rem",
              textAlign: "center",
              margin: "10px 0"
            }}>
              {mensaje}
            </p>
          )}

          <div className="actions" style={{ flexDirection: "column", gap: "10px" }}>
            <button type="submit" className="btn-primary">
              Ingresar
            </button>
            
            <p style={{ textAlign: "center", fontSize: "0.9rem", marginTop: "15px" }}>
              ¿No tienes cuenta? <Link to="/registro" className="terms-link">Regístrate aquí</Link>
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}