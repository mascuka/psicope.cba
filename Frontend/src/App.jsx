import { Routes, Route, useNavigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";

// Importación de Páginas
import Home from "./pages/Home";
import QuienSoy from "./pages/QuienSoy";
import Materiales from "./pages/Materiales";
import Psicopedagogiando from "./pages/Psicopedagogiando";
import Login from "./pages/Login";
import Perfil from "./pages/Perfil"; 
import MisCompras from "./pages/MisCompras";
import RegistroForm from "./pages/registroUsuario/RegistroForm";
import Success from "./pages/Success"; // <--- Nueva Importación
import Turnos from "./pages/Turnos";
import PanelAdmin from "./pages/admin/PanelAdmin";

export default function App() {
  const navigate = useNavigate();

  const handleCancelRegistration = () => {
    navigate("/");
  };
  
  const handleSuccessfulRegistration = () => {
    navigate("/login");
  };

  return (
    <div className="app-container">
      <Navbar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/quien-soy" element={<QuienSoy />} />
          <Route path="/materiales" element={<Materiales />} />
          <Route path="/psicopedagogiando" element={<Psicopedagogiando />} />
          <Route path="/login" element={<Login />} />
          <Route path="/perfil" element={<Perfil />} />
          <Route path="/mis-compras" element={<MisCompras />} />
          <Route path="/turnos" element={<Turnos />} />
          <Route path="/admin" element={<PanelAdmin />} />
          
          {/* --- Nueva Ruta para Mercado Pago --- */}
          <Route path="/success" element={<Success />} />

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
      </main>
      <Footer />
    </div>
  );
}