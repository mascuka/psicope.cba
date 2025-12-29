import React, { useState, useEffect, useRef } from 'react';
import './termsmodal.css'; 

export default function TermsModal({ onClose }) {
  const modalContentRef = useRef(null);
  const [isScrolledToBottom, setIsScrolledToBottom] = useState(false);

  // Revisa si el usuario ha llegado al fondo del contenido
  const handleScroll = () => {
    const element = modalContentRef.current;
    if (element) {
      // Calculamos si el scroll actual + la altura visible es mayor o igual a la altura total
      const isBottom = element.scrollHeight - element.scrollTop <= element.clientHeight + 5; // Tolerancia de 5px
      setIsScrolledToBottom(isBottom);
    }
  };

  useEffect(() => {
    // Revisar al montar por si el contenido es corto
    handleScroll();
  }, []);

  return (
    <div className="modal-overlay">
      <div className="modal-dialog">
        <div className="modal-header">
          <h3>Términos y Condiciones</h3>
        </div>
        <div 
          className="modal-content" 
          ref={modalContentRef} 
          onScroll={handleScroll}
        >
          {/* TÉRMINOS Y CONDICIONES GENÉRICOS */}
          <p>
            **1. Aceptación de los Términos.** Al hacer clic en "Aceptar" y/o utilizar nuestros servicios, usted ("el Usuario") acepta estar legalmente sujeto a estos términos y condiciones. Si no está de acuerdo con alguna parte de los términos, no debe utilizar nuestros servicios.
          </p>
          <p>
            **2. Modificaciones.** Nos reservamos el derecho de modificar estos términos en cualquier momento. El uso continuado del servicio después de dichas modificaciones constituye la aceptación de los nuevos términos.
          </p>
          <p>
            **3. Privacidad.** Su privacidad es importante para nosotros. El uso de la información personal se rige por nuestra Política de Privacidad, que se incorpora a estos Términos por referencia.
          </p>
          <p>
            **4. Obligaciones del Usuario.** El Usuario se compromete a no utilizar el servicio para fines ilegales o prohibidos por estos Términos. Esto incluye, pero no se limita a, la publicación de contenido ofensivo, ilegal o que viole derechos de terceros.
          </p>
          <p>
            **5. Cuentas de Usuario.** El Usuario es responsable de mantener la confidencialidad de su contraseña y es totalmente responsable de todas las actividades que ocurran bajo su cuenta.
          </p>
          <p>
            **6. Limitación de Responsabilidad.** En la máxima medida permitida por la ley, la empresa no será responsable por daños directos, indirectos, incidentales, consecuentes o ejemplares, incluidos, entre otros, daños por pérdida de beneficios, datos u otras pérdidas intangibles.
          </p>
          <p>
            **7. Ley Aplicable.** Estos Términos se regirán e interpretarán de acuerdo con las leyes del país de operación, sin dar efecto a los principios de conflicto de leyes.
          </p>
          <br/><br/><br/><br/><br/>
          <p>... Fin del documento. Desplácese hasta el final para aceptar. ...</p>

        </div>
        <div className="modal-footer">
          <button 
            className="btn-close-modal" 
            onClick={onClose} 
            disabled={!isScrolledToBottom}
          >
            {isScrolledToBottom ? 'Aceptar y Cerrar' : 'Por favor, Lea el Documento'}
          </button>
          {!isScrolledToBottom && <p className="scroll-warning">Desplácese hasta el final para habilitar el botón de Aceptar.</p>}
        </div>
      </div>
    </div>
  );
}