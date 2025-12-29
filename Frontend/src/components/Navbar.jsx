import { useEffect, useState, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../supabase/supabaseClient";
import { FaEdit, FaUserCircle, FaShoppingBag, FaSignOutAlt } from "react-icons/fa";
import Swal from "sweetalert2";
import "./Navbar.css";
import logoImage from "../assets/logo.png";

export default function Navbar() {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  const [navContent, setNavContent] = useState({
    brand_text: "Lic. Brenda Grossi",
    link_inicio: "Inicio",
    link_quien_soy: "Quién Soy",
    link_materiales: "Materiales",
    link_psicopedagogiando: "Psicopedagogiando"
  });

  useEffect(() => {
    const inicializar = async () => {
      await getSession();
      await fetchNavContent();
    };
    inicializar();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        checkIfAdmin(currentUser);
      } else {
        setIsAdmin(false);
      }
    });

    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      authListener.subscription.unsubscribe();
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const getSession = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const currentUser = session?.user ?? null;
    setUser(currentUser);
    if (currentUser) checkIfAdmin(currentUser);
  };

  const checkIfAdmin = async (currentUser) => {
    if (!currentUser) {
      setIsAdmin(false);
      return;
    }
    const { data } = await supabase
      .from("usuarios")
      .select("rol")
      .eq("id", currentUser.id)
      .single();
    
    if (data?.rol === "admin") {
      setIsAdmin(true);
    } else {
      setIsAdmin(false);
    }
  };

  const fetchNavContent = async () => {
    const { data } = await supabase.from("contenido_navbar").select("valores").eq("seccion", "principal").single();
    if (data) {
      setNavContent({ ...navContent, ...data.valores });
    }
  };

  const handleSave = async () => {
    const { error } = await supabase
      .from("contenido_navbar")
      .upsert({ seccion: "principal", valores: navContent }, { onConflict: 'seccion' });

    if (!error) {
      setEditMode(false);
      Swal.fire({ icon: 'success', title: 'Guardado', showConfirmButton: false, timer: 1500 });
    } else {
      Swal.fire({ icon: 'error', title: 'Error al guardar', text: error.message });
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setMenuOpen(false);
    setIsAdmin(false);
    navigate("/");
  };

  return (
    <nav className="navbar">
      <div className="navbar-container">
        <Link to="/" style={{ display: 'flex', alignItems: 'center', textDecoration: 'none', gap: '12px' }}>
          <img src={logoImage} alt="Logo" className="logo" />
          {editMode ? (
            <input 
              className="brand-edit-input"
              value={navContent.brand_text}
              onChange={e => setNavContent({...navContent, brand_text: e.target.value})}
              onClick={e => e.preventDefault()}
            />
          ) : (
            <span className="brand">{navContent.brand_text}</span>
          )}
        </Link>
      </div>

      <div className="nav-right-side">
        <div className="navbar-links">
          {editMode ? (
            <>
              <input className="link-edit-input" value={navContent.link_inicio} onChange={e => setNavContent({...navContent, link_inicio: e.target.value})} />
              <input className="link-edit-input" value={navContent.link_quien_soy} onChange={e => setNavContent({...navContent, link_quien_soy: e.target.value})} />
              <input className="link-edit-input" value={navContent.link_materiales} onChange={e => setNavContent({...navContent, link_materiales: e.target.value})} />
              <input className="link-edit-input" value={navContent.link_psicopedagogiando} onChange={e => setNavContent({...navContent, link_psicopedagogiando: e.target.value})} />
            </>
          ) : (
            <>
              <Link to="/">{navContent.link_inicio}</Link>
              <Link to="/quien-soy">{navContent.link_quien_soy}</Link>
              <Link to="/materiales">{navContent.link_materiales}</Link>
              <Link to="/psicopedagogiando">{navContent.link_psicopedagogiando}</Link>
            </>
          )}
        </div>

        <div className="navbar-right">
          {isAdmin && (
            <button 
              className="btn-edit-nav" 
              onClick={() => editMode ? handleSave() : setEditMode(true)}
              style={{marginRight: user ? '20px' : '0'}}
            >
              {editMode ? '✓ Guardar' : <FaEdit />}
            </button>
          )}
          
          {user ? (
            <div className="user-menu-container" ref={menuRef}>
              <button 
                className="user-name-button" 
                onClick={() => setMenuOpen(!menuOpen)}
              >
                {user.user_metadata?.nombre?.split(' ')[0] || "Usuario"}
                <span className={`arrow ${menuOpen ? 'up' : 'down'}`}>▾</span>
              </button>

              {menuOpen && (
                <div className="dropdown-menu">
                  <Link to="/perfil" onClick={() => setMenuOpen(false)}>
                    <FaUserCircle className="dropdown-icon" /> Ver perfil
                  </Link>
                  <Link to="/mis-compras" onClick={() => setMenuOpen(false)}>
                    <FaShoppingBag className="dropdown-icon" /> Mis compras
                  </Link>
                  <hr className="dropdown-divider" />
                  <button onClick={handleLogout} className="logout-item">
                    <FaSignOutAlt className="dropdown-icon" /> Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link className="login-btn" to="/login">Iniciar Sesión</Link>
          )}
        </div>
      </div>
    </nav>
  );
}