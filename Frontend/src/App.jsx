import { Routes, Route, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer"; 
import { testConnection } from "./supabase/testConnection";

// Importación de Páginas
import Home from "./pages/Home";
import QuienSoy from "./pages/QuienSoy";
import Materiales from "./pages/Materiales";
import Psicopedagogiando from "./pages/Psicopedagogiando";
import Login from "./pages/Login";
import Perfil from "./pages/Perfil"; 
import MisCompras from "./pages/MisCompras"; // <-- Nuevo componente
import RegistroForm from "./pages/registroUsuario/RegistroForm";

export default function App() {
  const navigate = useNavigate();

  useEffect(() => {
    testConnection();
  }, []);

  const handleCancelRegistration = () => {
    navigate("/");
  };
  
  const handleSuccessfulRegistration = () => {
    navigate("/login");
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: "#FCF8F8" }}>
      <Navbar />
      
      <div
        style={{
          marginTop: "100px",
          padding: "20px",
          flex: "1 0 auto",
          display: "flex",
          flexDirection: "column"
        }}
      >
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/quien-soy" element={<QuienSoy />} />
          <Route path="/materiales" element={<Materiales />} />
          <Route path="/psicopedagogiando" element={<Psicopedagogiando />} />
          <Route path="/login" element={<Login />} />
          <Route path="/perfil" element={<Perfil />} />
          <Route path="/mis-compras" element={<MisCompras />} /> {/* <-- Nueva Ruta */}
          <Route 
            path="/registro" 
            element={
              <RegistroForm 
                onSubmit={handleSuccessfulRegistration} 
                onCancel={handleCancelRegistration}
              />
            } 
          />
        </Routes>
      </div>

      <Footer />
    </div>
  );
}