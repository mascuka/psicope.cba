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

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setProcesando(false);
      Swal.fire({
        icon: "warning",
        title: "Sesión no encontrada",
        text: "Tu pago fue exitoso. Inicia sesión y revisa 'Mis Compras' en unos instantes.",
        confirmButtonColor: "#e5b3a8",
      }).then(() => navigate("/login"));
      return;
    }

    // Reintentamos varias veces: el webhook puede tardar uno o dos segundos en llegar
    const MAX_INTENTOS = 10;
    const ESPERA_MS = 1500;

    for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
      const { data: compra } = await supabase
        .from("compras")
        .select("id, nombre_material")
        .eq("payment_id", paymentId)
        .maybeSingle();

      if (compra) {
        setProcesando(false);
        Swal.fire({
          icon: "success",
          title: "¡Pago Confirmado!",
          text: `Gracias por adquirir: ${compra.nombre_material}. Ya puedes encontrarlo en tus compras.`,
          confirmButtonColor: "#e5b3a8",
        }).then(() => navigate("/mis-compras"));
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
      text: "Puede demorar unos minutos en aparecer en tu cuenta. Si en unos minutos no lo ves, contáctanos con tu ID de pago.",
      footer: `ID de Pago: ${paymentId}`,
      confirmButtonColor: "#e5b3a8",
    }).then(() => navigate("/mis-compras"));
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
            borderTop: '5px solid #e5b3a8',
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