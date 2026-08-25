import { useState } from "react";
import { supabase } from "../supabase/supabaseClient";
import Swal from "sweetalert2";
import mercadoPagoIcon from "../assets/mercadopago-icon.png";
import qrIcon from "../assets/QR ICO.png";
import QRCode from "qrcode";

// SweetAlert2 por default (heightAuto: true) toca el alto de html/body
// mientras el modal está abierto -- en una página larga (como Home, con
// hero + beneficios + destacados) eso hace que la página salte arriba de
// todo apenas se abre el primer cartel de la compra, perdiendo el lugar
// donde estaba el usuario. `heightAuto:false` es el arreglo estándar de
// SweetAlert2 para ese salto -- se aplica acá, a TODOS los carteles de
// esta compra (el formulario de invitado, las esperas de QR/Mercado
// Pago, etc.), no solo al primero.
const SwalCompra = Swal.mixin({ heightAuto: false });

// Todo el flujo real de compra (elegir método, formulario de invitado, QR
// compartido con cola de espera, Mercado Pago en pestaña aparte, polling
// de confirmación + descarga automática) -- extraído tal cual estaba en
// Materiales.jsx para que Home pueda ofrecer la MISMA interacción sin
// mandar a otra página, sin duplicar a mano esta lógica (que ya pasó por
// varias rondas de bugs reales en producción: destinatario equivocado del
// mail, popup bloqueado, condición de carrera del QR compartido). Lo usan
// tanto Materiales.jsx como Home.jsx -- un solo lugar, un solo comportamiento.
export function useComprarMaterial({ user, isAdmin, onCompraRegistrada }) {
  const [cargandoPago, setCargandoPago] = useState(null);

  const descargarArchivoSeguro = async (path, nombreDeseado) => {
    if (!path) return SwalCompra.fire("Error", "No hay archivo configurado.", "error");
    try {
      const fileName = path.includes('/') ? path.split('/').pop().split('?')[0] : path;
      const extension = fileName.includes('.') ? fileName.split('.').pop() : 'pdf';
      const nombreLimpio = (nombreDeseado || "material")
        .trim()
        .replace(/[\\/:*?"<>|]/g, "")
        .slice(0, 100);
      const nombreDescarga = `${nombreLimpio || "material"}.${extension}`;

      const { data, error } = await supabase.storage
        .from('materiales-privados')
        .createSignedUrl(fileName, 60, { download: nombreDescarga });
      if (error) throw error;
      // El link ya fuerza la descarga del lado del servidor (Content-
      // Disposition: attachment, por el `download` de arriba) -- navegar a
      // él en la MISMA pestaña dispara el archivo sin sacar al usuario de
      // la página; no hace falta abrir una pestaña nueva (que además
      // quedaría en blanco para siempre, porque una descarga no "carga"
      // nada que mostrar ahí).
      window.location.href = data.signedUrl;
    } catch (error) {
      SwalCompra.fire("Error", "El archivo no existe en el servidor privado.", "error");
    }
  };

  // Acredita el material directo en la base, sin pasar por Mercado Pago --
  // la usan el click normal de admin y la adquisición de materiales gratis.
  const registrarCompraDirecta = async (material, prefijoPago = "ADMIN") => {
    const { data: perfil } = await supabase.from("usuarios").select("nombre, email").eq("id", user.id).single();

    const precioFinal = material.en_oferta
      ? (material.precio * (1 - material.porcentaje_descuento / 100))
      : material.precio;

    const { error } = await supabase.from("compras").insert([
      {
        usuario_id: user.id,
        material_id: material.id,
        nombre_usuario: perfil?.nombre || (prefijoPago === "GRATIS" ? "Usuario" : "Admin"),
        email_usuario: user.email || perfil?.email,
        nombre_material: material.nombre,
        precio_pagado: precioFinal,
        status: "approved",
        payment_id: `${prefijoPago}_${Date.now()}`
      }
    ]);

    if (error) throw error;
    onCompraRegistrada?.(material.id);

    try {
      await supabase.functions.invoke("notificar-compra-material", {
        body: {
          email: user.email || perfil?.email,
          nombre: perfil?.nombre,
          nombre_material: material.nombre,
          archivo_url: material.archivo_url,
          nombre_descarga: material.nombre_descarga,
        },
      });
    } catch (mailErr) {
      console.warn("No se pudo enviar el email de compra:", mailErr);
    }

    descargarArchivoSeguro(material.archivo_url, material.nombre_descarga || material.nombre);
  };

  const esperarConfirmacionYDescargar = async (materialId, email, ventanaDescarga, canceladoRef) => {
    const inicioMs = Date.now();
    const desde = new Date(inicioMs - 5000).toISOString();
    const MAX_INTENTOS = 60;
    const ESPERA_MS = 2000;
    let compraEncontrada = null;

    // Antes esto consultaba la tabla "compras" directo desde el navegador
    // -- pero eso exigía que la tabla fuera legible por cualquiera con la
    // clave pública (sin RLS). Ahora pasa por esta función chica del
    // servidor, que hace la misma búsqueda puntual con la clave privada y
    // devuelve solo lo mínimo (si hay compra aprobada, y el payment_id
    // para pedir la descarga) -- nunca el resto de la tabla.
    for (let intento = 0; intento < MAX_INTENTOS && !canceladoRef.actual; intento++) {
      await new Promise((resolve) => setTimeout(resolve, ESPERA_MS));
      if (canceladoRef.actual) break;

      const { data } = await supabase.functions.invoke("verificar-compra", {
        body: { material_id: materialId, email, desde },
      });

      if (data?.compra) {
        compraEncontrada = data.compra;
        break;
      }
    }

    if (canceladoRef.actual) {
      try { ventanaDescarga?.close(); } catch { /* no-op */ }
      return false;
    }

    if (compraEncontrada) {
      let signedUrl = null;
      try {
        const { data: descarga } = await supabase.functions.invoke("descargar-compra", {
          body: { payment_id: compraEncontrada.payment_id },
        });
        signedUrl = descarga?.signedUrl || null;
        // El link ya fuerza la descarga (Content-Disposition: attachment) --
        // se dispara en ESTA pestaña (donde el usuario está mirando el
        // cartel de "esperando el pago"), no en la de Mercado Pago (que
        // quedó atrás, el usuario ya no la está mirando). Nunca abre una
        // pestaña nueva: una descarga no "carga" nada que mostrar ahí, así
        // que esa pestaña quedaría en blanco para siempre y solo confunde.
        if (signedUrl) window.location.href = signedUrl;
      } catch (descargaErr) {
        console.warn("No se pudo iniciar la descarga automática:", descargaErr);
      }

      await SwalCompra.fire({
        icon: "success",
        title: "¡Pago confirmado!",
        html: `Se envió por correo y se procedió a descargar <strong>${compraEncontrada.nombre_material}</strong>. ¡Esperamos que lo disfrutes!`,
        confirmButtonColor: "#D48CA6",
      });
      onCompraRegistrada?.(materialId);
      return true;
    }

    try { ventanaDescarga?.close(); } catch { /* no-op */ }
    await SwalCompra.fire({
      icon: "info",
      title: "¿Ya completaste el pago?",
      text: "Todavía no detectamos la confirmación acá. Si ya pagaste, puede demorar un minuto más en llegar -- también te lo mandamos por mail. Si pasan varios minutos y no aparece, escribinos.",
      confirmButtonColor: "#D48CA6",
    });
    return false;
  };

  // Navega ESTA MISMA pestaña a Mercado Pago -- no abre una pestaña nueva.
  // Cuando el pago se aprueba, Mercado Pago redirige de vuelta a esta
  // misma pestaña (/success), que es la que confirma, descarga el archivo
  // y manda el mail. Antes se abría una pestaña nueva (para esquivar el
  // bloqueador de popups, porque el link de pago tarda en llegar del
  // servidor) y esta pestaña de acá se quedaba esperando la confirmación
  // EN PARALELO -- entre las dos terminaba pasando todo dos veces (dos
  // pestañas con "listo", el archivo descargado dos veces). Navegando
  // directo acá no hace falta ninguna pestaña nueva, así que tampoco hay
  // nada que esquivarle a ningún bloqueador de popups.
  const pagarConMercadoPago = (initPoint) => {
    window.location.href = initPoint;
  };

  // Entre elegir "Mercado Pago" y que la página termine de navegar hay un
  // rato corto pero real (pedirle el link de pago al servidor, después el
  // propio salto) donde no pasaba nada en pantalla -- este cartel cubre
  // esa espera. No hace falta cerrarlo a mano: se va solo apenas la
  // navegación arranca.
  const mostrarRedirigiendoAMercadoPago = () => {
    SwalCompra.fire({
      title: "Redirigiendo a Mercado Pago...",
      allowOutsideClick: false,
      allowEscapeKey: false,
      showConfirmButton: false,
      customClass: { popup: "mp-espera-popup" },
      didOpen: () => Swal.showLoading(),
    });
  };

  const pagarConQR = async (material, email, nombreCompleto) => {
    const invitado = nombreCompleto
      ? { nombre: nombreCompleto.nombre, apellido: nombreCompleto.apellido, email }
      : undefined;

    const referenciaExterna = crypto.randomUUID();

    const canceladoRef = { actual: false };
    SwalCompra.fire({
      title: "Generando tu QR",
      html: "Estamos preparando tu código para pagar. Puede tardar unos segundos.",
      allowOutsideClick: false,
      allowEscapeKey: false,
      showCancelButton: true,
      cancelButtonText: "Cancelar",
      showConfirmButton: false,
      customClass: { popup: "mp-espera-popup" },
      didOpen: () => Swal.showLoading(),
    }).then((result) => {
      if (result.dismiss === Swal.DismissReason.cancel) canceladoRef.actual = true;
    });

    const MAX_INTENTOS_COLA = 60;
    let reserva = null;

    for (let intento = 0; intento < MAX_INTENTOS_COLA && !canceladoRef.actual; intento++) {
      const { data, error } = await supabase.functions.invoke("reservar-qr-cobro", {
        body: { material_id: material.id, invitado, referencia_externa: referenciaExterna },
      });
      if (error) {
        SwalCompra.fire("Error de Conexión", `Mercado Pago dice: ${error.message}`, "error");
        return false;
      }
      if (data?.error) {
        SwalCompra.fire("Error de Conexión", `Mercado Pago dice: ${data.error}`, "error");
        return false;
      }
      if (data?.ok) {
        reserva = data;
        break;
      }
      if (canceladoRef.actual) break;
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    if (canceladoRef.actual) return false;

    if (!reserva) {
      SwalCompra.fire({
        icon: "info",
        title: "Seguía ocupado",
        text: "El QR de cobro estuvo ocupado todo este tiempo. Probá de nuevo en un ratito, o usá la opción de Mercado Pago.",
        confirmButtonColor: "#D48CA6",
      });
      return false;
    }

    const qrDataUrl = await QRCode.toDataURL(reserva.qr_code_payload, {
      width: 320,
      margin: 1,
      color: { dark: "#2B2530", light: "#FFFFFF" },
    });

    const cancelQrRef = { actual: false };
    SwalCompra.fire({
      title: "Escaneá para pagar",
      html: `
        <p class="mp-qr-nota">Con la app de Mercado Pago o cualquier billetera con QR interoperable (Cuenta DNI, Modo, tu banco...).</p>
        <img src="${qrDataUrl}" alt="Código QR para pagar" class="mp-qr-imagen" />
        <p class="mp-qr-nota">Esta ventana se actualiza sola apenas se confirme el pago.</p>
      `,
      allowOutsideClick: false,
      allowEscapeKey: false,
      showCancelButton: true,
      cancelButtonText: "Cancelar",
      showConfirmButton: false,
      customClass: { popup: "mp-qr-popup" },
    }).then((result) => {
      if (result.dismiss === Swal.DismissReason.cancel) {
        cancelQrRef.actual = true;
        supabase.functions.invoke("reservar-qr-cobro", {
          body: { accion: "liberar", referencia_externa: reserva.referencia_externa },
        }).catch(() => {});
      }
    });

    return esperarConfirmacionYDescargar(material.id, email, null, cancelQrRef);
  };

  const elegirMetodoPago = async () => {
    const iconoMercadoPago = `<img src="${mercadoPagoIcon}" alt="" width="28" height="19" style="vertical-align:-4px;flex-shrink:0" />`;
    const iconoQR = `<img src="${qrIcon}" alt="" width="28" height="22" style="vertical-align:-5px;flex-shrink:0" />`;
    const { value: metodo } = await SwalCompra.fire({
      title: "¿Cómo querés pagar?",
      html: `
        <div class="mp-metodo-elegir">
          <button type="button" id="btn-metodo-qr" class="mp-metodo-btn">${iconoQR} Abonar con QR</button>
          <button type="button" id="btn-metodo-mp" class="mp-metodo-btn">${iconoMercadoPago} Mercado Pago</button>
        </div>
      `,
      showConfirmButton: false,
      showCancelButton: true,
      cancelButtonText: "Cancelar",
      customClass: { popup: "mp-metodo-popup" },
      didOpen: () => {
        document.getElementById("btn-metodo-qr").addEventListener("click", () => Swal.close({ isConfirmed: true, value: "qr" }));
        document.getElementById("btn-metodo-mp").addEventListener("click", () => Swal.close({ isConfirmed: true, value: "mp" }));
      },
    });
    return metodo || null;
  };

  const comprarComoInvitado = async (material) => {
    const iconoMercadoPago = `<img src="${mercadoPagoIcon}" alt="" width="30" height="20" style="vertical-align:-5px;flex-shrink:0" />`;
    const iconoQR = `<img src="${qrIcon}" alt="" width="28" height="22" style="vertical-align:-5px;flex-shrink:0" />`;

    const validarDatos = () => {
      const nombre = document.getElementById("swal-nombre").value.trim();
      const apellido = document.getElementById("swal-apellido").value.trim();
      const email = document.getElementById("swal-email").value.trim();
      const emailConfirm = document.getElementById("swal-email-confirm").value.trim();

      if (!nombre || !apellido || !email || !emailConfirm) {
        Swal.showValidationMessage("Completá todos los campos");
        return null;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        Swal.showValidationMessage("El email no es válido");
        return null;
      }
      if (email.toLowerCase() !== emailConfirm.toLowerCase()) {
        Swal.showValidationMessage("Los dos emails no coinciden");
        return null;
      }
      return { nombre, apellido, email };
    };

    const { value: resultado } = await SwalCompra.fire({
      title: "Comprar sin cuenta",
      html: `
        <p class="mp-guest-intro">Dejanos tus datos para continuar con la compra.</p>
        <div class="mp-guest-form">
          <div class="mp-guest-field">
            <label for="swal-nombre">Nombre</label>
            <input id="swal-nombre" class="mp-guest-input" placeholder="Tu nombre" autocomplete="given-name">
          </div>
          <div class="mp-guest-field">
            <label for="swal-apellido">Apellido</label>
            <input id="swal-apellido" class="mp-guest-input" placeholder="Tu apellido" autocomplete="family-name">
          </div>
          <div class="mp-guest-field">
            <label for="swal-email">Email</label>
            <input id="swal-email" type="email" class="mp-guest-input" placeholder="tu@email.com" autocomplete="email">
          </div>
          <div class="mp-guest-field">
            <label for="swal-email-confirm">Confirmar email</label>
            <input id="swal-email-confirm" type="email" class="mp-guest-input" placeholder="Repetí tu email">
          </div>
        </div>
        <div class="mp-metodo-elegir mp-metodo-elegir-form">
          <button type="button" id="btn-metodo-qr" class="mp-metodo-btn">${iconoQR} Abonar con QR</button>
          <button type="button" id="btn-metodo-mp" class="mp-metodo-btn">${iconoMercadoPago} Mercado Pago</button>
        </div>
      `,
      showConfirmButton: false,
      customClass: { popup: "mp-guest-popup" },
      showCancelButton: true,
      focusConfirm: false,
      didOpen: () => {
        document.getElementById("btn-metodo-qr").addEventListener("click", () => {
          const datos = validarDatos();
          if (datos) Swal.close({ isConfirmed: true, value: { ...datos, metodo: "qr" } });
        });
        document.getElementById("btn-metodo-mp").addEventListener("click", () => {
          const datos = validarDatos();
          if (datos) Swal.close({ isConfirmed: true, value: { ...datos, metodo: "mp" } });
        });
      },
    });

    if (!resultado) return;
    const { metodo, ...datosInvitado } = resultado;

    setCargandoPago(material.id);
    try {
      if (metodo === "qr") {
        await pagarConQR(material, datosInvitado.email, { nombre: datosInvitado.nombre, apellido: datosInvitado.apellido });
        return;
      }

      mostrarRedirigiendoAMercadoPago();

      const { data, error } = await supabase.functions.invoke("crear-preferencia", {
        body: { material_id: material.id, invitado: datosInvitado },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.init_point) {
        pagarConMercadoPago(data.init_point);
      } else {
        throw new Error("No se recibió el link de pago.");
      }
    } catch (error) {
      console.error("Error en compra como invitado:", error);
      SwalCompra.fire("Error de Conexión", `Mercado Pago dice: ${error.message}`, "error");
    } finally {
      setCargandoPago(null);
    }
  };

  // Material gratis, sin cuenta: pide nombre/apellido/email (sin elegir
  // método de pago, no hay nada que pagar) y lo acredita + manda por mail
  // directo, vía una función de servidor (un invitado no tiene auth.uid(),
  // así que no puede insertar la compra por su cuenta como sí hace un
  // usuario logueado -- ver registrarCompraDirecta).
  const adquirirGratisComoInvitado = async (material) => {
    const { value: datos } = await SwalCompra.fire({
      title: "Descargar material gratuito",
      html: `
        <p class="mp-guest-intro">Dejanos tus datos para mandarte el material.</p>
        <div class="mp-guest-form">
          <div class="mp-guest-field">
            <label for="swal-nombre">Nombre</label>
            <input id="swal-nombre" class="mp-guest-input" placeholder="Tu nombre" autocomplete="given-name">
          </div>
          <div class="mp-guest-field">
            <label for="swal-apellido">Apellido</label>
            <input id="swal-apellido" class="mp-guest-input" placeholder="Tu apellido" autocomplete="family-name">
          </div>
          <div class="mp-guest-field">
            <label for="swal-email">Email</label>
            <input id="swal-email" type="email" class="mp-guest-input" placeholder="tu@email.com" autocomplete="email">
          </div>
          <div class="mp-guest-field">
            <label for="swal-email-confirm">Confirmar email</label>
            <input id="swal-email-confirm" type="email" class="mp-guest-input" placeholder="Repetí tu email">
          </div>
        </div>
      `,
      confirmButtonText: "Descargar",
      confirmButtonColor: "#D48CA6",
      customClass: { popup: "mp-guest-popup" },
      showCancelButton: true,
      focusConfirm: false,
      preConfirm: () => {
        const nombre = document.getElementById("swal-nombre").value.trim();
        const apellido = document.getElementById("swal-apellido").value.trim();
        const email = document.getElementById("swal-email").value.trim();
        const emailConfirm = document.getElementById("swal-email-confirm").value.trim();
        if (!nombre || !apellido || !email || !emailConfirm) {
          Swal.showValidationMessage("Completá todos los campos");
          return null;
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          Swal.showValidationMessage("El email no es válido");
          return null;
        }
        if (email.toLowerCase() !== emailConfirm.toLowerCase()) {
          Swal.showValidationMessage("Los dos emails no coinciden");
          return null;
        }
        return { nombre, apellido, email };
      },
    });

    if (!datos) return;

    setCargandoPago(material.id);
    try {
      const { data, error } = await supabase.functions.invoke("adquirir-material-gratis", {
        body: { material_id: material.id, invitado: datos },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      let signedUrl = null;
      try {
        const { data: descarga } = await supabase.functions.invoke("descargar-compra", {
          body: { payment_id: data.payment_id },
        });
        signedUrl = descarga?.signedUrl || null;
        // El link ya fuerza la descarga (Content-Disposition: attachment) --
        // se dispara directo en esta misma pestaña, sin abrir ninguna
        // nueva: una pestaña nueva para esto quedaría en blanco para
        // siempre (una descarga no "carga" nada que mostrar ahí), que es
        // justo lo que confundía antes.
        if (signedUrl) window.location.href = signedUrl;
      } catch (descargaErr) {
        console.warn("No se pudo iniciar la descarga automática:", descargaErr);
      }

      await SwalCompra.fire({
        icon: "success",
        title: "¡Listo!",
        html: `Se envió por correo y se procedió a descargar <strong>${material.nombre}</strong>. ¡Esperamos que lo disfrutes!`,
        confirmButtonColor: "#D48CA6",
      });
    } catch (error) {
      console.error("Error adquiriendo material gratis como invitado:", error);
      SwalCompra.fire("Error", error.message || "No se pudo adquirir el material.", "error");
    } finally {
      setCargandoPago(null);
    }
  };

  const comprar = async (material) => {
    if (!user) {
      if (Number(material.precio) === 0) {
        return adquirirGratisComoInvitado(material);
      }
      return comprarComoInvitado(material);
    }

    if (isAdmin) {
      setCargandoPago(material.id);
      try {
        await registrarCompraDirecta(material, "ADMIN");
        SwalCompra.fire("¡Listo!", "Material acreditado automáticamente (modo admin, sin pasar por Mercado Pago).", "success");
      } catch (error) {
        console.error("Error acreditando compra de admin:", error);
        SwalCompra.fire("Error", "No se pudo acreditar el material.", "error");
      } finally {
        setCargandoPago(null);
      }
      return;
    }

    if (Number(material.precio) === 0) {
      setCargandoPago(material.id);
      try {
        await registrarCompraDirecta(material, "GRATIS");
        SwalCompra.fire("¡Listo!", "El material gratuito ya está en tu cuenta. Ya lo podés descargar.", "success");
      } catch (error) {
        console.error("Error adquiriendo material gratis:", error);
        SwalCompra.fire("Error", "No se pudo adquirir el material.", "error");
      } finally {
        setCargandoPago(null);
      }
      return;
    }

    const metodo = await elegirMetodoPago();
    if (!metodo) return;

    setCargandoPago(material.id);

    try {
      if (metodo === "qr") {
        await pagarConQR(material, user.email, null);
        return;
      }

      mostrarRedirigiendoAMercadoPago();

      const { data: { session } } = await supabase.auth.getSession();

      const { data, error } = await supabase.functions.invoke("crear-preferencia", {
        body: { material_id: material.id },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.init_point) {
        pagarConMercadoPago(data.init_point);
      } else {
        throw new Error("No se recibió el link de pago.");
      }
    } catch (error) {
      console.error("Error completo handleComprar:", error);
      SwalCompra.fire("Error de Conexión", `Mercado Pago dice: ${error.message}`, "error");
    } finally {
      setCargandoPago(null);
    }
  };

  return { comprar, cargandoPago };
}
