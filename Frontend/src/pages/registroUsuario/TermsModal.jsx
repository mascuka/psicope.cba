import React, { useEffect } from 'react';
import { FaTimes } from 'react-icons/fa';
import './termsmodal.css';

// Antes el botón solo se habilitaba después de bajar hasta el final, y no
// había otra forma de cerrar la ventana: si el aviso de "desplazate" no se
// veía o el scroll no llegaba justo, quedaba trabada. Ahora se cierra con
// la X, con Escape o tocando afuera, y "Aceptar" además tilda la casilla.
export default function TermsModal({ onClose, onAceptar }) {
  useEffect(() => {
    const alApretarTecla = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', alApretarTecla);
    return () => window.removeEventListener('keydown', alApretarTecla);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-dialog" role="dialog" aria-modal="true" aria-labelledby="terminos-titulo" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 id="terminos-titulo">Términos y Condiciones</h3>
          <button type="button" className="modal-cerrar" onClick={onClose} aria-label="Cerrar">
            <FaTimes />
          </button>
        </div>
        <div className="modal-content">
          <p>
            <strong>1. Aceptación de los Términos.</strong> Al hacer clic en "Aceptar" y/o utilizar nuestros servicios, usted ("el Usuario") acepta estar legalmente sujeto a estos términos y condiciones. Si no está de acuerdo con alguna parte de los términos, no debe utilizar nuestros servicios.
          </p>
          <p>
            <strong>2. Modificaciones.</strong> Nos reservamos el derecho de modificar estos términos en cualquier momento. El uso continuado del servicio después de dichas modificaciones constituye la aceptación de los nuevos términos.
          </p>
          <p>
            <strong>3. Privacidad.</strong> Su privacidad es importante para nosotros. El uso de la información personal se rige por nuestra Política de Privacidad, que se incorpora a estos Términos por referencia.
          </p>
          <p>
            <strong>4. Obligaciones del Usuario.</strong> El Usuario se compromete a no utilizar el servicio para fines ilegales o prohibidos por estos Términos. Esto incluye, pero no se limita a, la publicación de contenido ofensivo, ilegal o que viole derechos de terceros.
          </p>
          <p>
            <strong>5. Cuentas de Usuario.</strong> El Usuario es responsable de mantener la confidencialidad de su contraseña y es totalmente responsable de todas las actividades que ocurran bajo su cuenta.
          </p>
          <p>
            <strong>6. Limitación de Responsabilidad.</strong> En la máxima medida permitida por la ley, la empresa no será responsable por daños directos, indirectos, incidentales, consecuentes o ejemplares, incluidos, entre otros, daños por pérdida de beneficios, datos u otras pérdidas intangibles.
          </p>
          <p>
            <strong>7. Ley Aplicable.</strong> Estos Términos se regirán e interpretarán de acuerdo con las leyes del país de operación, sin dar efecto a los principios de conflicto de leyes.
          </p>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn-close-modal" onClick={onAceptar}>
            Aceptar
          </button>
        </div>
      </div>
    </div>
  );
}
