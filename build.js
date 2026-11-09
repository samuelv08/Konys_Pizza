/* =====================================================================
 * build.js — Paso de build para Vercel (Node >= 18, sin dependencias)
 * ---------------------------------------------------------------------
 * Un sitio estático no puede leer variables de entorno en el navegador.
 * Este script, que corre en Vercel durante el despliegue:
 *   1. Copia el sitio a la carpeta dist/
 *   2. Genera dist/js/config.js con las variables de entorno si existen,
 *      o con js/config.js para compilaciones locales.
 * Así las claves no quedan escritas en el repositorio de GitHub.
 * ===================================================================== */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const DIST = 'dist';
const requeridas = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'];
const configLocalPath = path.join('js', 'config.js');
let configLocal = {};

if (fs.existsSync(configLocalPath)) {
  const contexto = { window: {} };
  const fuente = fs.readFileSync(configLocalPath, 'utf8');
  vm.runInNewContext(fuente, contexto, { timeout: 1000 });
  configLocal = contexto.window.APP_CONFIG || {};
}

const cfg = Object.fromEntries(
  [...requeridas, 'WHATSAPP', 'TELEFONO'].map((k) => [
    k,
    process.env[k] || configLocal[k],
  ])
);
cfg.WHATSAPP = cfg.WHATSAPP || '573000000000';
cfg.TELEFONO = cfg.TELEFONO || '300 000 0000';

const faltan = requeridas.filter((k) => !cfg[k]);
if (faltan.length) {
  console.error('✖ Faltan valores requeridos: ' + faltan.join(', '));
  console.error('  Configúralas en Vercel o completa js/config.js para desarrollo local.');
  process.exit(1);
}

// 1. Copiar el sitio a dist/
fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
for (const item of ['index.html', 'admin.html', 'css', 'js']) {
  fs.cpSync(item, path.join(DIST, item), { recursive: true });
}

// 2. Generar config.js (las variables de entorno prevalecen sobre la copia local)
fs.rmSync(path.join(DIST, 'js', 'config.js'), { force: true });
fs.writeFileSync(
  path.join(DIST, 'js', 'config.js'),
  '/* Archivo generado por build.js — no editar */\nwindow.APP_CONFIG = ' +
    JSON.stringify(cfg, null, 2) + ';\n'
);

console.log('✔ Build listo en dist/');
