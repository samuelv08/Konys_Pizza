/* =====================================================================
 * build.js — Paso de build para Vercel (Node >= 18, sin dependencias)
 * ---------------------------------------------------------------------
 * Un sitio estático no puede leer variables de entorno en el navegador.
 * Este script, que corre en Vercel durante el despliegue:
 *   1. Copia el sitio a la carpeta dist/
 *   2. Genera dist/js/config.js con los valores de las variables de
 *      entorno (configuradas en Vercel > Settings > Environment Variables)
 * Así las claves no quedan escritas en el repositorio de GitHub.
 * ===================================================================== */
const fs = require('fs');
const path = require('path');

const DIST = 'dist';
const requeridas = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'ADMIN_PASSWORD'];
const faltan = requeridas.filter((k) => !process.env[k]);

if (faltan.length) {
  console.error('✖ Faltan variables de entorno: ' + faltan.join(', '));
  console.error('  Configúralas en Vercel > Settings > Environment Variables.');
  process.exit(1);
}

// 1. Copiar el sitio a dist/
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
for (const item of ['index.html', 'admin.html', 'css', 'js']) {
  fs.cpSync(item, path.join(DIST, item), { recursive: true });
}

// 2. Generar config.js a partir del entorno (reemplaza cualquier copia local)
const cfg = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  WHATSAPP: process.env.WHATSAPP || '573000000000',
  TELEFONO: process.env.TELEFONO || '300 000 0000',
};
fs.rmSync(path.join(DIST, 'js', 'config.js'), { force: true });
fs.writeFileSync(
  path.join(DIST, 'js', 'config.js'),
  '/* Archivo generado por build.js — no editar */\nwindow.APP_CONFIG = ' +
    JSON.stringify(cfg, null, 2) + ';\n'
);

console.log('✔ Build listo en dist/');
