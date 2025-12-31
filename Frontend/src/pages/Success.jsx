import React, { useEffect, useState, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabase/supabaseClient";
import Swal from "sweetalert2";

export default function Success() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [procesando, setProcesando] = useState(true);
  
  // MEJORA: Ref para evitar que React 18 ejecute la lógica dos veces seguidas
  const procesadoRef = useRef(false);

  useEffect(() => {
    confirmarCompra();
    // eslint-disable-next-line
  }, []);

  const confirmarCompra = async () => {
    // Si ya se está procesando, salimos para no duplicar
    if (procesadoRef.current) return;

    // Mercado Pago devuelve estos datos por la URL
    const paymentId = searchParams.get("payment_id");
    const status = searchParams.get("status");
    const materialId = searchParams.get("external_reference");

    if (status === "approved" && materialId) {
      try {
        // Marcamos como procesado inmediatamente
        procesadoRef.current = true;

        // 1. Verificar sesión del usuario
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("No se encontró sesión de usuario.");

        // MEJORA ADICIONAL: Verificar si este payment_id ya fue registrado antes
        // Esto evita errores si el usuario refresca la página de Success
        const { data: existente } = await supabase
          .from("compras")
          .select("id")
          .eq("payment_id", paymentId)
          .maybeSingle();

        if (existente) {
          setProcesando(false);
          Swal.fire({
            icon: "info",
            title: "Compra ya registrada",
            text: "Esta compra ya había sido procesada anteriormente.",
            confirmButtonColor: "#e5b3a8",
          }).then(() => navigate("/mis-compras"));
          return;
        }

        // 2. Obtener datos del material para el registro histórico
        const { data: material, error: errorMat } = await supabase
          .from("materiales")
          .select("nombre, precio, en_oferta, porcentaje_descuento")
          .eq("id", materialId)
          .single();

        if (errorMat) throw new Error("Error al obtener datos del material");

        // 3. Obtener datos del perfil del usuario
        const { data: perfil } = await supabase
          .from("usuarios")
          .select("nombre, email")
          .eq("id", user.id)
          .single();

        // 4. Calcular el precio que realmente pagó (por si hay ofertas activas)
        const precioFinal = material.en_oferta 
          ? (material.precio * (1 - material.porcentaje_descuento / 100)) 
          : material.precio;

        // 5. Insertar en la tabla 'compras' con todos los campos nuevos
        const { error: errorInsert } = await supabase.from("compras").insert([
          {
            usuario_id: user.id,
            material_id: materialId,
            payment_id: paymentId,
            status: status,
            nombre_usuario: perfil?.nombre || "Usuario sin nombre",
            email_usuario: perfil?.email || user.email,
            nombre_material: material.nombre,
            precio_pagado: precioFinal,
            fecha: new Date().toISOString()
          },
        ]);

        if (errorInsert) throw errorInsert;

        setProcesando(false);
        Swal.fire({
          icon: "success",
          title: "¡Pago Confirmado!",
          text: `Gracias por adquirir: ${material.nombre}. Ya puedes encontrarlo en tus compras.`,
          confirmButtonColor: "#e5b3a8",
        }).then(() => navigate("/mis-compras"));

      } catch (error) {
        console.error("Error en Success:", error);
        setProcesando(false);
        // Reseteamos el ref por si falló y el usuario quiere intentar refrescar para reintentar
        procesadoRef.current = false; 
        
        Swal.fire({
          icon: "warning",
          title: "Atención",
          text: "El pago fue exitoso pero hubo un problema al registrarlo. Por favor, contacta a soporte con tu ID de pago.",
          footer: `ID de Pago: ${paymentId}`
        });
      }
    } else {
      // Si el estado no es aprobado o no hay materialId, volvemos a materiales
      setProcesando(false);
      navigate("/materiales");
    }
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
          <h2>Procesando y registrando tu compra...</h2>
          <p>Por favor, no cierres esta ventana.</p>
        </>
      ) : (
        <h2>Redirigiendo...</h2>
      )}
    </div>
  );
}