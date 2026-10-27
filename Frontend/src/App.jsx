import { lazy, Suspense } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import ScrollToTop from "./components/ScrollToTop";
import DireccionCanonica from "./components/DireccionCanonica";

import Loader from "./components/Loader";

// Importación de Páginas. Home va directo (es la que más se visita); el
// resto se baja recién al entrar -- antes todo iba en un solo archivo de
// ~3 MB (panel admin, asistente de IA, librerías de PDF incluidos) que
// cualquier visitante tenía que bajar para ver la portada.
import Home from "./pages/Home";
const QuienSoy = lazy(() => import("./pages/QuienSoy"));
const Materiales = lazy(() => import("./pages/Materiales"));
const Psicopedagogiando = lazy(() => import("./pages/Psicopedagogiando"));
const Login = lazy(() => import("./pages/Login"));
const RestablecerContrasena = lazy(() => import("./pages/RestablecerContrasena"));
const Perfil = lazy(() => import("./pages/Perfil"));
const MisCompras = lazy(() => import("./pages/MisCompras"));
const RegistroForm = lazy(() => import("./pages/registroUsuario/RegistroForm"));
const Success = lazy(() => import("./pages/Success"));
const Turnos = lazy(() => import("./pages/Turnos"));
const PanelAdmin = lazy(() => import("./pages/admin/PanelAdmin"));

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
      <ScrollToTop />
      <DireccionCanonica />
      <Navbar />
      <main className="main-content">
        <Suspense fallback={<Loader />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/quien-soy" element={<QuienSoy />} />
          <Route path="/materiales" element={<Materiales />} />
          <Route path="/psicopedagogiando" element={<Psicopedagogiando />} />
          <Route path="/login" element={<Login />} />
          <Route path="/restablecer-contrasena" element={<RestablecerContrasena />} />
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
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}