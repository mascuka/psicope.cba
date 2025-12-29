import React from "react";
import { FaInstagram, FaWhatsapp, FaHeart } from "react-icons/fa";
import "./footer.css";

export default function Footer() {
  return (
    <footer className="footer-container">
      <div className="footer-content">
        {/* MARCA - TODO EN UNA LÍNEA */}
        <div className="footer-brand">
          <div className="footer-logo">Psicope.cba</div>
          <span className="footer-separator">|</span>
          <div className="footer-tagline">Lic. Brenda Grossi</div>
        </div>
        
        {/* CENTRO - HECHO CON AMOR */}
        <div className="footer-center">
          <div className="footer-heart">
            Hecho con <FaHeart className="heart-icon" /> para educar
          </div>
        </div>
        
        {/* REDES SOCIALES */}
        <div className="footer-socials">
          <a 
            href="https://www.instagram.com/psicope.cba/" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="social-link instagram"
          >
            <FaInstagram /> Instagram
          </a>
          
          <a 
            href="https://wa.me/5493516575488" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="social-link whatsapp"
          >
            <FaWhatsapp /> WhatsApp
          </a>
        </div>
      </div>
    </footer>
  );
}