import { supabase } from "./supabaseClient";

export async function testConnection() {
  try {
    const { data, error } = await supabase.from("usuarios").select("*").limit(1);

    if (error) throw error;

    console.log("✅ Conexión exitosa con Supabase:", data);
  } catch (e) {
    console.error("❌ Error al conectar con Supabase:", e.message);
  }
}
