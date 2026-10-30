/* =====================================================================
 * supabase.js — Conexión con Supabase + utilidades compartidas
 * ---------------------------------------------------------------------
 * Lo cargan index.html y admin.html (después de config.js y del SDK).
 * Aquí viven: el cliente `db`, el manejo de fechas/horas en zona
 * horaria de Bogotá, el formato de moneda, el escape de HTML (anti XSS),
 * la generación de slots y los avisos (toasts).
 * ===================================================================== */

// ---------------------------------------------------------------------
// 1. Conexión
// ---------------------------------------------------------------------
const CFG = window.APP_CONFIG || {};

// ¿Está bien configurado? (evita errores confusos si falta config.js)
const CONFIG_OK = Boolean(
  window.supabase &&
  CFG.SUPABASE_URL &&
  CFG.SUPABASE_ANON_KEY &&
  !CFG.SUPABASE_URL.includes('TU-PROYECTO')
);

// Cliente de Supabase. Usa SOLO la anon key (pública). Nunca la service_role.
const db = CONFIG_OK
  ? window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY)
  : null;

// ---------------------------------------------------------------------
// 2. Atajos del DOM
// ---------------------------------------------------------------------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// ---------------------------------------------------------------------
// 3. Fechas y horas (siempre en la zona horaria de Bogotá)
// Se trabaja con texto "YYYY-MM-DD" y "HH:MM" para evitar los
// desfases que provoca convertir a UTC con objetos Date.
// ---------------------------------------------------------------------
const TZ = 'America/Bogota';
const DIAS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado']; // índice = Date.getDay()
const DIAS_TXT = {
  domingo: 'Domingo', lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles',
  jueves: 'Jueves', viernes: 'Viernes', sabado: 'Sábado',
};
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Fecha y minutos transcurridos del día, ahora mismo, en Bogotá. */
function ahoraBogota() {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const g = (tipo) => partes.find((p) => p.type === tipo).value;
  return {
    fecha: `${g('year')}-${g('month')}-${g('day')}`,
    minutos: parseInt(g('hour'), 10) * 60 + parseInt(g('minute'), 10),
  };
}
const hoyBogota = () => ahoraBogota().fecha;
const minutosAhoraBogota = () => ahoraBogota().minutos;

/** Suma n días a una fecha "YYYY-MM-DD" y devuelve otra "YYYY-MM-DD". */
function sumarDias(fecha, n) {
  const d = new Date(fecha + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Nombre del día ('lunes'...'domingo') de una fecha "YYYY-MM-DD". */
function diaSemanaDe(fecha) {
  return DIAS[new Date(fecha + 'T12:00:00Z').getUTCDay()];
}

/** "HH:MM" o "HH:MM:SS" -> minutos desde medianoche. */
function aMin(hora) {
  const [h, m] = hora.split(':');
  return parseInt(h, 10) * 60 + parseInt(m, 10);
}

/** Minutos desde medianoche -> "HH:MM". */
function aHHMM(min) {
  return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
}

/** "18:00:00" -> "6:00 p. m." */
function formatHora12(hora) {
  const m = aMin(hora);
  const h = Math.floor(m / 60);
  const min = String(m % 60).padStart(2, '0');
  return `${h % 12 || 12}:${min} ${h >= 12 ? 'p. m.' : 'a. m.'}`;
}

/** "2026-11-04" -> "Miércoles, 4 de noviembre de 2026" */
function formatFechaLarga(fecha) {
  const d = new Date(fecha + 'T12:00:00Z');
  return `${DIAS_TXT[DIAS[d.getUTCDay()]]}, ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}

/** "2026-11-04" -> "04/11/2026" */
function formatFechaCorta(fecha) {
  return fecha.split('-').reverse().join('/');
}

// ---------------------------------------------------------------------
// 4. Slots (franjas de reserva)
// ---------------------------------------------------------------------
/**
 * Genera los slots de un día a partir de sus filas de `horarios`.
 * Ej.: 12:30-14:30 con slots de 60 min -> 12:30-13:30 y 13:30-14:30.
 * Solo se crean slots que caben completos dentro de la jornada.
 */
function generarSlots(filasHorario) {
  const slots = [];
  [...filasHorario]
    .filter((f) => f.activo !== false)
    .sort((a, b) => aMin(a.hora_inicio) - aMin(b.hora_inicio))
    .forEach((f) => {
      const ini = aMin(f.hora_inicio);
      const fin = aMin(f.hora_fin);
      const dur = f.duracion_slot;
      for (let t = ini; t + dur <= fin; t += dur) {
        slots.push({ inicio: aHHMM(t), fin: aHHMM(t + dur), jornada: f.jornada });
      }
    });
  return slots;
}

// ---------------------------------------------------------------------
// 5. Formato y seguridad
// ---------------------------------------------------------------------
/** Formatea pesos colombianos: 32000 -> "$ 32.000" */
function formatCOP(valor) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0,
  }).format(valor);
}

/** Escapa HTML para evitar XSS al pintar texto escrito por usuarios. */
function esc(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Devuelve la URL solo si es http(s); si no, texto vacío. */
function urlSegura(valor) {
  try {
    const u = new URL(valor);
    return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : '';
  } catch (_) {
    return '';
  }
}

/** Ordena objetos por nombre con números naturales (Mesa 2 antes de Mesa 10). */
const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true });

// ---------------------------------------------------------------------
// 6. Errores y avisos
// ---------------------------------------------------------------------
/** Convierte un error de Supabase/PostgreSQL en un mensaje claro en español. */
function mensajeError(error) {
  if (!error) return '';
  switch (error.code) {
    case '23505': return 'Ya existe un registro con esos datos.';
    case '23P01': return 'El horario se cruza con otra reserva existente.';
    case '23503': return 'No se puede eliminar porque tiene registros asociados. Mejor desactívalo u ocúltalo.';
    case 'P0001': return error.message; // mensajes del trigger de validación (ya vienen en español)
    case '42501': return 'No tienes permiso para esta acción (revisa las políticas RLS).';
  }
  if (/failed to fetch|network/i.test(error.message || '')) {
    return 'No hay conexión con el servidor. Revisa tu internet e inténtalo de nuevo.';
  }
  return error.message || 'Ocurrió un error inesperado.';
}

/** Aviso flotante. tipo: 'ok' | 'error' */
function toast(mensaje, tipo = 'ok') {
  let cont = $('#toasts');
  if (!cont) {
    cont = document.createElement('div');
    cont.id = 'toasts';
    cont.setAttribute('aria-live', 'polite');
    document.body.appendChild(cont);
  }
  const t = document.createElement('div');
  t.className = 'toast ' + tipo;
  t.textContent = mensaje;
  cont.appendChild(t);
  setTimeout(() => t.remove(), 4200);
}
