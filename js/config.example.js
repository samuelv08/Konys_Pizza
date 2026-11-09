/* =====================================================================
 * config.example.js — Plantilla de configuración
 * ---------------------------------------------------------------------
 * USO LOCAL:  copia este archivo como js/config.js y completa los datos.
 *             (js/config.js está en .gitignore y no se sube a GitHub)
 * EN VERCEL:  no hace falta crear config.js; build.js lo genera desde las
 *             variables de entorno del proyecto.
 *
 * ⚠ SUPABASE_ANON_KEY es una clave PÚBLICA por diseño (la protege RLS).
 *   NUNCA pongas aquí la service_role key.
 * ===================================================================== */
window.APP_CONFIG = {
  SUPABASE_URL: "https://TU-PROYECTO.supabase.co",
  SUPABASE_ANON_KEY: "TU_ANON_KEY_PUBLICA",
  WHATSAPP: "573000000000",   // solo números, con indicativo de país (57 = Colombia)
  TELEFONO: "300 000 0000"    // como se mostrará en pantalla
};
