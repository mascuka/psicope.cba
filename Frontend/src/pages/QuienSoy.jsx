import React, { useEffect, useState, useRef } from "react";
import { supabase } from "../supabase/supabaseClient";
import Swal from 'sweetalert2';
import "./quienSoy.css";

export default function QuienSoy() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  
  const [titulo, setTitulo] = useState("Quién Soy");
  const [texto, setTexto] = useState("");
  const [imagen, setImagen] = useState("");
  
  const fileInputRef = useRef(null);
  const BUCKET_NAME = "imagenes-web"; 

  useEffect(() => {
    const inicializar = async () => {
      await checkUserRole();
      await fetchContenido();
    };
    inicializar();
  }, []);

  const checkUserRole = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from("usuarios").select("rol").eq("id", user.id).single();
      if (data?.rol === "admin") setIsAdmin(true);
    }
  };

  const fetchContenido = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from("contenido_web").select("*").eq("seccion", "quien_soy").maybeSingle();
      if (data && data.texto) {
        if (data.texto.includes("|||")) {
          const partes = data.texto.split("|||");
          setTitulo(partes[0]);
          setTexto(partes[1]);
        } else {
          setTexto(data.texto);
        }
        
        if (data.imagen_url) {
          setImagen(`${data.imagen_url}?t=${new Date().getTime()}`);
        }
      }
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const handleSaveTodo = async () => {
    try {
      const contenidoCombinado = `${titulo}|||${texto}`;
      const { error } = await supabase
        .from("contenido_web")
        .upsert({ 
          seccion: "quien_soy",
          texto: contenidoCombinado 
        }, { onConflict: 'seccion' });

      if (error) throw error;
      Swal.fire('¡Éxito!', 'Todo se actualizó correctamente.', 'success');
      setEditMode(false);
    } catch (error) {
      Swal.fire('Error', 'No se pudo guardar: ' + error.message, 'error');
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setSubiendo(true);
    try {
      // --- LÓGICA DE BORRADO DE FOTO ANTERIOR ---
      if (imagen) {
        try {
          // Extraemos el nombre del archivo de la URL guardada
          // Las URLs de Supabase suelen ser: .../storage/v1/object/public/bucket/nombre-archivo.jpg
          const urlParts = imagen.split(`${BUCKET_NAME}/`);
          if (urlParts.length > 1) {
            const oldFileName = urlParts[1].split('?')[0]; // Quitamos el query param del tiempo (?t=...)
            await supabase.storage.from(BUCKET_NAME).remove([oldFileName]);
            console.log("Archivo viejo eliminado:", oldFileName);
          }
        } catch (errorBorrado) {
          console.error("No se pudo borrar la foto anterior o no existía:", errorBorrado);
        }
      }

      // --- SUBIDA DE NUEVA FOTO ---
      const fileExt = file.name.split('.').pop();
      const fileName = `perfil-brenda-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage.from(BUCKET_NAME).upload(fileName, file);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from(BUCKET_NAME).getPublicUrl(fileName);

      const { error: updateError } = await supabase
        .from("contenido_web")
        .upsert({ 
          seccion: "quien_soy", 
          imagen_url: publicUrl 
        }, { onConflict: 'seccion' });

      if (updateError) throw updateError;
      
      setImagen(`${publicUrl}?t=${new Date().getTime()}`);
      Swal.fire('¡Genial!', 'Foto actualizada y archivo anterior eliminado.', 'success');
    } catch (error) {
      Swal.fire('Error', 'Hubo un problema: ' + error.message, 'error');
    } finally {
      setSubiendo(false);
    }
  };

  if (loading) {
    return (
      <div className="quien-soy-container">
        <div className="loading-container">
          <p>Cargando...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="quien-soy-container">
      <div className="quien-soy-card">
        <div className="quien-soy-foto-seccion">
          <div className="marco-perfil-rosa">
            <img src={imagen || "https://via.placeholder.com/400x500"} alt="Perfil" className="foto-renderizada" />
          </div>
          {isAdmin && (
            <>
              <input type="file" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} accept="image/*" />
              <button onClick={() => fileInputRef.current.click()} className="btn-subir-foto" disabled={subiendo}>
                {subiendo ? "Subiendo..." : "Cambiar Foto"}
              </button>
            </>
          )}
        </div>

        <div className="quien-soy-texto-seccion">
          {editMode ? (
            <input 
              className="input-titulo-edit" 
              value={titulo} 
              onChange={(e) => setTitulo(e.target.value)} 
            />
          ) : (
            <h2 className="titulo-principal">{titulo}</h2>
          )}
          
          {editMode ? (
            <textarea 
              className="texto-edit-area" 
              value={texto} 
              onChange={(e) => setTexto(e.target.value)} 
            />
          ) : (
            <p className="texto-mostrado">{texto || "Aún no hay descripción..."}</p>
          )}

          {isAdmin && (
            <div className="botones-admin-texto">
              {editMode ? (
                <>
                  <button onClick={handleSaveTodo} className="btn-confirmar">Guardar Cambios</button>
                  <button onClick={() => setEditMode(false)} className="btn-cancelar">Cancelar</button>
                </>
              ) : (
                <button onClick={() => setEditMode(true)} className="btn-editar-texto">Editar Todo</button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}