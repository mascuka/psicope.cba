import React, { useEffect, useState, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabase/supabaseClient";
import Swal from "sweetalert2";

export default function Success() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [procesando, setProcesando] = useState(true);
  const [tardando, setTardando] = useState(false);

  // Ref para evitar que React 18 dispare la lógica dos veces seguidas
  const procesadoRef = useRef(false);

  useEffect(() => {
    esperarConfirmacion();
    // eslint-disable-next-line
  }, []);

  // --- IMPORTANTE ---
  // Esta página YA NO registra la compra. Solo se queda mirando la tabla
  // "compras" esperando a que el webhook (mp-webhook), que valida el pago
  // directo contra la API de Mercado Pago del lado del servidor, la inserte.
  // Así evitamos que alguien pueda "regalarse" un material armando la URL a mano.
  const esperarConfirmacion = async () => {
    if (procesadoRef.current) return;
    procesadoRef.current = true;

    const paymentId = searchParams.get("payment_id");
    const status = searchParams.get("status");
    const materialId = searchParams.get("external_reference");

    // Si Mercado Pago no marcó el pago como aprobado, no hay nada que esperar
    if (status !== "approved" || !materialId || !paymentId) {
      setProcesando(false);
      navigate("/materiales");
      return;
    }

    // Ya no hace falta estar logueado para llegar hasta acá: se puede
    // comprar como invitado. El link de descarga se pide server-side (con
    // el payment_id como prueba) en vez de generarlo acá mismo, porque un
    // invitado no tiene sesión para poder pedirle el signed URL a Storage
    // directamente.
    const { data: { user } } = await supabase.auth.getUser();

    // Reintentamos varias veces: el webhook puede tardar uno o dos segundos en llegar
    const MAX_INTENTOS = 10;
    const ESPERA_MS = 1500;

    for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
      const { data } = await supabase.functions.invoke("verificar-compra", {
        body: { payment_id: paymentId },
      });
      const compra = data?.compra;

      if (compra) {
        setProcesando(false);

        // Descarga automática, además del mail que ya le mandó el webhook.
        try {
          const { data: descarga } = await supabase.functions.invoke("descargar-compra", {
            body: { payment_id: paymentId },
          });
          // El link fuerza la descarga (Content-Disposition: attachment) --
          // se dispara en esta misma pestaña, no en una nueva (que quedaría
          // en blanco para siempre, ya que una descarga no "carga" nada
          // para mostrar ahí).
          if (descarga?.signedUrl) window.location.href = descarga.signedUrl;
        } catch (descargaErr) {
          console.warn("No se pudo iniciar la descarga automática:", descargaErr);
        }

        Swal.fire({
          icon: "success",
          title: "¡Pago Confirmado!",
          text: user
            ? `Se envió por correo y se procedió a descargar ${compra.nombre_material}. También lo tenés disponible en "Mis Compras". ¡Esperamos que lo disfrutes!`
            : `Se envió por correo y se procedió a descargar ${compra.nombre_material}. ¡Esperamos que lo disfrutes!`,
          confirmButtonColor: "#D48CA6",
        }).then(() => navigate(user ? "/mis-compras" : "/materiales"));
        return;
      }

      // Después de varios intentos, avisamos que está tardando más de lo normal
      if (intento === 4) setTardando(true);

      await new Promise((resolve) => setTimeout(resolve, ESPERA_MS));
    }

    // Si después de todos los intentos no apareció, no marcamos error:
    // el pago fue aprobado por Mercado Pago, puede que el webhook esté demorado.
    setProcesando(false);
    Swal.fire({
      icon: "info",
      title: "Tu pago fue aprobado",
      text: user
        ? "Puede demorar unos minutos en aparecer en tu cuenta. Si en unos minutos no lo ves, contáctanos con tu ID de pago."
        : "Puede demorar unos minutos en llegarte por mail. Si en unos minutos no te llegó, contáctanos con tu ID de pago.",
      footer: `ID de Pago: ${paymentId}`,
      confirmButtonColor: "#D48CA6",
    }).then(() => navigate(user ? "/mis-compras" : "/materiales"));
  };

  return (
    <div style={{
      height: '80vh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      fontFamily: 'inherit',
      color: '#444'
    }}>
      {procesando ? (
        <>
          <div className="spinner" style={{
            width: '50px',
            height: '50px',
            border: '5px solid #f3f3f3',
            borderTop: '5px solid #2B2530',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            marginBottom: '20px'
          }}></div>
          <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
          <h2>Confirmando tu pago...</h2>
          <p>Por favor, no cierres esta ventana.</p>
          {tardando && (
            <p style={{ marginTop: '10px', fontSize: '0.9rem', color: '#888' }}>
              Está tardando un poco más de lo normal, ya casi...
            </p>
          )}
        </>
      ) : (
        <h2>Redirigiendo...</h2>
      )}
    </div>
  );
}