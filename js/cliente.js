/* =====================================================================
 * cliente.js — Lógica del módulo cliente (index.html)
 * ---------------------------------------------------------------------
 * Flujo: cargar mesas -> clic en "Ver horarios" -> elegir fecha ->
 * ver slots libres/ocupados -> elegir slot -> datos -> confirmar.
 *
 * Anti doble reserva (3 capas):
 *   1) Se consulta la ocupación al elegir la fecha.
 *   2) Justo antes del insert se vuelve a consultar (verificación fresca).
 *   3) La base de datos rechaza duplicados (índice único + exclusión).
 * ===================================================================== */

// ---------------------------------------------------------------------
// Estado de la aplicación
// ---------------------------------------------------------------------
const state = {
  mesas: [],          // mesas activas
  horarios: [],       // horarios activos (todas las jornadas de la semana)
  ocupacionHoy: [],   // reservas de hoy (para el estado de las tarjetas)
  platos: [],         // platos disponibles
  categoria: null,    // pestaña activa de la carta
  mesaSel: null,      // mesa elegida en el modal
  fecha: null,        // fecha elegida "YYYY-MM-DD"
  slotSel: null,      // slot elegido {inicio, fin, jornada}
  ocupados: [],       // reservas existentes de mesaSel en fecha
};

const CATEGORIAS = { pizzas: 'Pizzas', entradas: 'Entradas', postres: 'Postres', bebidas: 'Bebidas' };
const ZONAS_TXT = { terraza: 'Terraza', salon: 'Salón' };
const DIAS_VISIBLES = 28;   // cuántos días hacia adelante se muestran en el calendario
const DIAS_CORTOS = { domingo: 'dom', lunes: 'lun', martes: 'mar', miercoles: 'mié', jueves: 'jue', viernes: 'vie', sabado: 'sáb' };

// ---------------------------------------------------------------------
// Utilidades de slots
// ---------------------------------------------------------------------
/** Slots de un día concreto según los horarios activos. */
function slotsDelDia(fecha) {
  const dia = diaSemanaDe(fecha);
  return generarSlots(state.horarios.filter((h) => h.dia_semana === dia));
}

/** ¿El día tiene al menos una jornada activa? */
const diaTieneServicio = (fecha) => slotsDelDia(fecha).length > 0;

/** ¿El slot ya empezó (solo aplica si la fecha es hoy)? */
function slotEsPasado(fecha, slot) {
  return fecha === hoyBogota() && aMin(slot.inicio) <= minutosAhoraBogota();
}

/** ¿El slot se cruza con alguna reserva de la lista? */
function slotOcupado(slot, reservas) {
  const ini = aMin(slot.inicio);
  const fin = aMin(slot.fin);
  return reservas.some((r) => ini < aMin(r.hora_fin) && fin > aMin(r.hora_inicio));
}

/** Consulta fresca de la ocupación de una mesa en una fecha (vista sin datos personales). */
function consultarOcupados(mesaId, fecha) {
  return db.from('reservas_ocupadas')
    .select('mesa_id, fecha, hora_inicio, hora_fin')
    .eq('mesa_id', mesaId)
    .eq('fecha', fecha);
}

// ---------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', init);

async function init() {
  $('#f-anio').textContent = new Date().getFullYear();
  configurarMenu();
  configurarContacto();
  configurarModal();

  if (!CONFIG_OK) {
    const aviso = $('#aviso-config');
    aviso.hidden = false;
    aviso.textContent = 'Falta configurar la conexión con Supabase. Copia js/config.example.js como js/config.js y completa tus datos.';
    $('#mesas-grid').innerHTML = bloqueMensaje('La aplicación aún no está conectada a la base de datos.');
    $('#carta-lista').innerHTML = bloqueMensaje('La carta no está disponible todavía.');
    return;
  }

  // Los horarios se necesitan primero: el estado de las mesas depende de ellos
  await cargarHorarios();
  await Promise.all([cargarMesas(), cargarCarta()]);
}

const bloqueMensaje = (texto) => `<p class="vacio">${esc(texto)}</p>`;

function configurarMenu() {
  const btn = $('#menu-btn');
  const nav = $('#nav');
  btn.addEventListener('click', () => {
    const abierto = nav.classList.toggle('abierto');
    btn.setAttribute('aria-expanded', String(abierto));
  });
  // Cierra el menú móvil al elegir una opción
  nav.addEventListener('click', (e) => {
    if (e.target.closest('a')) {
      nav.classList.remove('abierto');
      btn.setAttribute('aria-expanded', 'false');
    }
  });
}

function configurarContacto() {
  $('#f-telefono').textContent = CFG.TELEFONO || '—';
  const wa = $('#f-whatsapp');
  const numero = (CFG.WHATSAPP || '').replace(/\D/g, '');
  wa.href = numero ? `https://wa.me/${numero}` : '#';
}

// ---------------------------------------------------------------------
// Carga de datos
// ---------------------------------------------------------------------
async function cargarHorarios() {
  const { data, error } = await db.from('horarios').select('*').eq('activo', true);
  if (error) {
    toast('No pudimos cargar los horarios. ' + mensajeError(error), 'error');
    state.horarios = [];
    return;
  }
  state.horarios = data || [];
}

async function cargarMesas() {
  const grid = $('#mesas-grid');
  const { data, error } = await db.from('mesas').select('*').eq('activa', true);

  if (error) {
    grid.innerHTML = bloqueMensaje('No pudimos cargar las mesas. ' + mensajeError(error));
    return;
  }
  state.mesas = (data || []).sort(porNombre);

  // Caso: no hay mesas activas
  if (!state.mesas.length) {
    grid.innerHTML = bloqueMensaje('Por ahora no hay mesas disponibles para reservar. Escríbenos por WhatsApp y te ayudamos.');
    return;
  }

  // Ocupación de hoy para calcular Libre/Ocupado en cada tarjeta
  const { data: oc } = await db.from('reservas_ocupadas')
    .select('mesa_id, fecha, hora_inicio, hora_fin')
    .eq('fecha', hoyBogota());
  state.ocupacionHoy = oc || [];

  renderMesas();
}

async function cargarCarta() {
  const lista = $('#carta-lista');
  const { data, error } = await db.from('platos').select('*').eq('disponible', true).order('nombre');
  if (error) {
    lista.innerHTML = bloqueMensaje('No pudimos cargar la carta. ' + mensajeError(error));
    return;
  }
  state.platos = data || [];
  const presentes = Object.keys(CATEGORIAS).filter((c) => state.platos.some((p) => p.categoria === c));
  if (!presentes.length) {
    $('#carta-tabs').innerHTML = '';
    lista.innerHTML = bloqueMensaje('La carta se está actualizando. Vuelve en un momento.');
    return;
  }
  state.categoria = presentes[0];
  renderCarta(presentes);
}

// ---------------------------------------------------------------------
// Tarjetas de mesas (RF-01)
// ---------------------------------------------------------------------
/** 'libre' si hoy quedan slots por reservar, 'ocupado' si no, 'cerrado' si hoy no hay servicio. */
function estadoHoy(mesa) {
  const hoy = hoyBogota();
  const slots = slotsDelDia(hoy);
  if (!slots.length) return 'cerrado';
  const reservas = state.ocupacionHoy.filter((o) => o.mesa_id === mesa.id);
  const hayLibre = slots.some((s) => !slotEsPasado(hoy, s) && !slotOcupado(s, reservas));
  return hayLibre ? 'libre' : 'ocupado';
}

function renderMesas() {
  const ETIQUETA = { libre: 'Libre hoy', ocupado: 'Ocupado hoy', cerrado: 'Sin servicio hoy' };
  $('#mesas-grid').innerHTML = state.mesas.map((m) => {
    const est = estadoHoy(m);
    const foto = urlSegura(m.foto_url);
    const imagen = foto
      ? `<img src="${esc(foto)}" alt="Foto de ${esc(m.nombre)}" loading="lazy">`
      : `<div class="mesa-sin-foto" aria-hidden="true"><i class="fa-solid fa-utensils"></i></div>`;
    return `
      <article class="mesa-card">
        <div class="mesa-img">${imagen}</div>
        <div class="mesa-body">
          <div class="mesa-fila">
            <h3>${esc(m.nombre)}</h3>
            <span class="badge ${est}">${ETIQUETA[est]}</span>
          </div>
          <p class="mesa-meta">
            <span><i class="fa-solid fa-location-dot" aria-hidden="true"></i> ${esc(ZONAS_TXT[m.zona] || m.zona)}</span>
            <span><i class="fa-solid fa-user-group" aria-hidden="true"></i> Hasta ${m.capacidad} personas</span>
          </p>
          <button class="btn btn-full" data-ver="${esc(m.id)}">Ver horarios</button>
        </div>
      </article>`;
  }).join('');
}

// Un solo listener para todos los botones "Ver horarios"
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-ver]');
  if (btn) abrirReserva(btn.dataset.ver);
});

// ---------------------------------------------------------------------
// Carta digital (RF-07)
// ---------------------------------------------------------------------
function renderCarta(categoriasPresentes) {
  $('#carta-tabs').innerHTML = categoriasPresentes.map((c) => `
    <button class="tab ${c === state.categoria ? 'activa' : ''}" role="tab"
            aria-selected="${c === state.categoria}" data-cat="${c}">${CATEGORIAS[c]}</button>`).join('');

  const platos = state.platos.filter((p) => p.categoria === state.categoria);
  $('#carta-lista').innerHTML = platos.map((p) => `
    <article class="plato">
      <div>
        <h3>${esc(p.nombre)}</h3>
        ${p.descripcion ? `<p>${esc(p.descripcion)}</p>` : ''}
      </div>
      <span class="precio">${formatCOP(p.precio)}</span>
    </article>`).join('');

  // Listeners de las pestañas
  $$('#carta-tabs .tab').forEach((t) => t.addEventListener('click', () => {
    state.categoria = t.dataset.cat;
    renderCarta(categoriasPresentes);
  }));
}

// ---------------------------------------------------------------------
// Modal de reserva
// ---------------------------------------------------------------------
function configurarModal() {
  const modal = $('#modal');
  // Cerrar: clic fuera de la tarjeta, botón con data-cerrar, o tecla Esc
  modal.addEventListener('click', (e) => {
    if (e.target === modal || e.target.closest('[data-cerrar]')) cerrarModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) cerrarModal();
  });
}

function abrirModal() {
  $('#modal').hidden = false;
  document.body.classList.add('sin-scroll');
}

function cerrarModal() {
  $('#modal').hidden = true;
  document.body.classList.remove('sin-scroll');
}

/** Abre el flujo de reserva para una mesa (RF-02). */
function abrirReserva(mesaId) {
  const mesa = state.mesas.find((m) => m.id === mesaId);
  if (!mesa) return;

  // Reinicia el estado de la reserva
  state.mesaSel = mesa;
  state.fecha = null;
  state.slotSel = null;
  state.ocupados = [];

  $('#modal-contenido').innerHTML = `
    <div class="modal-header">
      <div>
        <h3 id="modal-titulo">${esc(mesa.nombre)}</h3>
        <p>${esc(ZONAS_TXT[mesa.zona] || mesa.zona)} · hasta ${mesa.capacidad} personas</p>
      </div>
      <button class="modal-x" data-cerrar aria-label="Cerrar"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
    </div>

    <div class="modal-body">
      <!-- Paso 1: fecha -->
      <section>
        <h4><span class="num">1</span> Elige la fecha</h4>
        <div id="dias" class="dias-grid" role="group" aria-label="Fechas disponibles"></div>
        <p class="ayuda">Los días en gris no tienen servicio.</p>
      </section>

      <!-- Paso 2: hora -->
      <section id="paso-hora" hidden>
        <h4><span class="num">2</span> Elige la hora</h4>
        <p id="fecha-txt" class="fecha-txt"></p>
        <div id="slots"></div>
        <div class="leyenda" aria-hidden="true">
          <span><i class="pt libre"></i> Libre</span>
          <span><i class="pt ocupado"></i> Ocupado</span>
          <span><i class="pt seleccionado"></i> Tu elección</span>
        </div>
      </section>

      <!-- Paso 3: datos -->
      <section id="paso-datos" hidden>
        <h4><span class="num">3</span> Tus datos</h4>
        <form id="form-reserva" novalidate>
          <label for="f-nombre">Nombre
            <input id="f-nombre" type="text" maxlength="80" autocomplete="name" required>
          </label>
          <label for="f-personas">Número de personas
            <input id="f-personas" type="number" min="1" max="${mesa.capacidad}" inputmode="numeric" value="2" required>
            <small>Esta mesa admite máximo ${mesa.capacidad}.</small>
          </label>
          <label for="f-contacto">Teléfono o correo (opcional)
            <input id="f-contacto" type="text" maxlength="60" autocomplete="tel">
          </label>

          <div id="resumen" class="resumen" aria-live="polite"></div>
          <p id="form-error" class="error" role="alert"></p>
          <button type="submit" id="btn-confirmar" class="btn btn-full btn-lg">Confirmar reserva</button>
        </form>
      </section>
    </div>`;

  renderDias();
  $('#form-reserva').addEventListener('submit', confirmarReserva);
  $('#form-reserva').addEventListener('input', actualizarResumen);
  abrirModal();
}

/** Calendario de los próximos días; solo se habilitan los días con servicio (RF-03). */
function renderDias() {
  const hoy = hoyBogota();
  let html = '';
  for (let i = 0; i < DIAS_VISIBLES; i++) {
    const f = sumarDias(hoy, i);
    const dia = diaSemanaDe(f);
    const num = parseInt(f.slice(8), 10);
    const mes = MESES[parseInt(f.slice(5, 7), 10) - 1].slice(0, 3);
    const habil = diaTieneServicio(f);
    html += `
      <button type="button" class="dia ${habil ? '' : 'cerrado'}" data-fecha="${f}" ${habil ? '' : 'disabled'}
              aria-label="${esc(formatFechaLarga(f))}${habil ? '' : ' (sin servicio)'}">
        <small>${DIAS_CORTOS[dia]}</small>
        <strong>${num}</strong>
        <small>${mes}</small>
      </button>`;
  }
  const cont = $('#dias');
  cont.innerHTML = html;

  cont.addEventListener('click', (e) => {
    const btn = e.target.closest('.dia');
    if (btn && !btn.disabled) elegirFecha(btn.dataset.fecha);
  });

  if (!$$('.dia:not([disabled])', cont).length) {
    cont.insertAdjacentHTML('afterend', '<p class="error">No hay días con servicio configurados. Escríbenos por WhatsApp.</p>');
  }
}

/** Al elegir fecha: consulta la ocupación de esa mesa/día y pinta los slots. */
async function elegirFecha(fecha) {
  state.fecha = fecha;
  state.slotSel = null;
  state.ocupados = [];

  $$('#dias .dia').forEach((b) => b.classList.toggle('seleccionado', b.dataset.fecha === fecha));
  $('#paso-hora').hidden = false;
  $('#paso-datos').hidden = true;
  $('#fecha-txt').textContent = formatFechaLarga(fecha);
  $('#slots').innerHTML = '<p class="vacio">Consultando horarios…</p>';

  const { data, error } = await consultarOcupados(state.mesaSel.id, fecha);
  if (state.fecha !== fecha) return; // el usuario cambió de día mientras cargaba

  if (error) {
    $('#slots').innerHTML = `<p class="error">No pudimos consultar los horarios. ${esc(mensajeError(error))}</p>`;
    return;
  }
  state.ocupados = data || [];
  renderSlots();
  $('#paso-hora').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/** Grilla de slots: libre / ocupado / seleccionado (RF-04). */
function renderSlots() {
  const cont = $('#slots');
  const slots = slotsDelDia(state.fecha);

  if (!slots.length) {
    cont.innerHTML = '<p class="error">Ese día no tenemos servicio. Elige otra fecha.</p>';
    return;
  }

  const grupos = {};
  slots.forEach((s) => { (grupos[s.jornada] = grupos[s.jornada] || []).push(s); });

  let libres = 0;
  let html = '';
  Object.keys(grupos).forEach((jornada) => {
    html += `<h5 class="jornada">${jornada === 'almuerzo' ? 'Almuerzo' : 'Noche'}</h5><div class="slots-grid">`;
    html += grupos[jornada].map((s) => {
      const ocupado = slotEsPasado(state.fecha, s) || slotOcupado(s, state.ocupados);
      const sel = state.slotSel && state.slotSel.inicio === s.inicio;
      if (!ocupado) libres++;
      const clase = ocupado ? 'ocupado' : (sel ? 'seleccionado' : 'libre');
      return `<button type="button" class="slot ${clase}" data-inicio="${s.inicio}" ${ocupado ? 'disabled' : ''}
                      aria-pressed="${Boolean(sel)}" aria-label="${formatHora12(s.inicio)}${ocupado ? ', ocupado' : ''}">${formatHora12(s.inicio)}</button>`;
    }).join('');
    html += '</div>';
  });

  if (!libres) {
    html += '<p class="error">Ya no quedan horarios libres este día. Prueba con otra fecha u otra mesa.</p>';
  }
  cont.innerHTML = html;

  // Si el slot elegido dejó de estar libre, se limpia la selección
  if (state.slotSel && !$('.slot.seleccionado', cont)) {
    state.slotSel = null;
    $('#paso-datos').hidden = true;
  }

  $$('.slot:not([disabled])', cont).forEach((b) => b.addEventListener('click', () => elegirSlot(b.dataset.inicio)));
}

function elegirSlot(inicio) {
  state.slotSel = slotsDelDia(state.fecha).find((s) => s.inicio === inicio) || null;
  renderSlots();
  $('#paso-datos').hidden = false;
  $('#form-error').textContent = '';
  actualizarResumen();
  $('#paso-datos').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

/** Resumen en vivo de la reserva antes de confirmar. */
function actualizarResumen() {
  const res = $('#resumen');
  if (!res || !state.slotSel) return;
  const nombre = $('#f-nombre').value.trim();
  const personas = $('#f-personas').value;
  res.innerHTML = `
    <strong>Resumen</strong>
    <ul>
      <li>Mesa: ${esc(state.mesaSel.nombre)} (${esc(ZONAS_TXT[state.mesaSel.zona] || '')})</li>
      <li>Fecha: ${esc(formatFechaLarga(state.fecha))}</li>
      <li>Hora: ${formatHora12(state.slotSel.inicio)} a ${formatHora12(state.slotSel.fin)}</li>
      <li>Personas: ${esc(personas || '—')}</li>
      <li>A nombre de: ${esc(nombre || '—')}</li>
    </ul>`;
}

// ---------------------------------------------------------------------
// Confirmación (RF-05 y RF-06)
// ---------------------------------------------------------------------
/** Devuelve un mensaje de error si algo está mal, o null si todo es válido. */
function validarReserva({ nombre, personas, contacto }) {
  const mesa = state.mesaSel;
  if (!state.fecha) return 'Elige una fecha.';
  if (state.fecha < hoyBogota()) return 'No puedes reservar en una fecha pasada.';
  if (!diaTieneServicio(state.fecha)) return 'Ese día no tenemos servicio. Elige otra fecha.';
  if (!state.slotSel) return 'Elige un horario libre.';
  if (slotEsPasado(state.fecha, state.slotSel)) return 'Ese horario ya pasó. Elige otro.';
  if (nombre.length < 2) return 'Escribe tu nombre (mínimo 2 letras).';
  if (!Number.isInteger(personas) || personas < 1) return 'Indica cuántas personas vendrán.';
  if (personas > mesa.capacidad) return `Esta mesa admite máximo ${mesa.capacidad} personas. Elige otra mesa o reduce el número.`;
  if (contacto.length > 60) return 'El dato de contacto es demasiado largo.';
  return null;
}

async function confirmarReserva(e) {
  e.preventDefault();
  const errorEl = $('#form-error');
  const btn = $('#btn-confirmar');
  errorEl.textContent = '';

  const datos = {
    nombre: $('#f-nombre').value.trim(),
    personas: parseInt($('#f-personas').value, 10),
    contacto: $('#f-contacto').value.trim(),
  };

  // 1) Validaciones locales
  const problema = validarReserva(datos);
  if (problema) { errorEl.textContent = problema; return; }

  const mesa = state.mesaSel;
  const slot = state.slotSel;
  const fecha = state.fecha;

  btn.disabled = true;
  btn.textContent = 'Verificando disponibilidad…';

  try {
    // 2) Verificación fresca: ¿alguien tomó el slot mientras llenabas el formulario?
    const { data: ocupados, error: errCheck } = await consultarOcupados(mesa.id, fecha);
    if (errCheck) { errorEl.textContent = 'No pudimos verificar el horario. ' + mensajeError(errCheck); return; }
    if (slotOcupado(slot, ocupados || [])) {
      await refrescarSlotsTrasConflicto(ocupados || []);
      errorEl.textContent = 'Ese horario acaba de ser reservado por otra persona. Elige otro.';
      return;
    }

    // 3) Inserción. Si dos personas llegan a la vez, la base de datos
    //    rechaza al segundo (índice único / restricción de solapamiento).
    btn.textContent = 'Confirmando…';
    const { error } = await db.from('reservas').insert({
      mesa_id: mesa.id,
      cliente_nombre: datos.nombre,
      cliente_contacto: datos.contacto || null,
      num_personas: datos.personas,
      fecha,
      hora_inicio: slot.inicio,
      hora_fin: slot.fin,
      estado: 'confirmada',
    });

    if (error) {
      if (error.code === '23505' || error.code === '23P01') {
        const { data: oc } = await consultarOcupados(mesa.id, fecha);
        await refrescarSlotsTrasConflicto(oc || []);
        errorEl.textContent = 'Ese horario acaba de ser reservado por otra persona. Elige otro.';
      } else {
        errorEl.textContent = mensajeError(error);
      }
      return;
    }

    mostrarConfirmacion(datos);
  } finally {
    // Si hubo error, el botón vuelve a quedar usable
    const b = $('#btn-confirmar');
    if (b) { b.disabled = false; b.textContent = 'Confirmar reserva'; }
  }
}

/** Actualiza la grilla cuando se descubre que el slot ya no está libre. */
async function refrescarSlotsTrasConflicto(ocupados) {
  state.ocupados = ocupados;
  state.slotSel = null;
  renderSlots();
  $('#paso-datos').hidden = true;
}

/** Pantalla de éxito (RF-06). */
function mostrarConfirmacion(datos) {
  const mesa = state.mesaSel;
  const slot = state.slotSel;
  $('#modal-contenido').innerHTML = `
    <div class="confirmacion">
      <div class="check" aria-hidden="true"><i class="fa-solid fa-check"></i></div>
      <h3 id="modal-titulo">¡Reserva confirmada!</h3>
      <p>Te esperamos en Konys Pizza.</p>
      <ul class="resumen-final">
        <li><span>Mesa</span><strong>${esc(mesa.nombre)} · ${esc(ZONAS_TXT[mesa.zona] || '')}</strong></li>
        <li><span>Fecha</span><strong>${esc(formatFechaLarga(state.fecha))}</strong></li>
        <li><span>Hora</span><strong>${formatHora12(slot.inicio)} a ${formatHora12(slot.fin)}</strong></li>
        <li><span>Personas</span><strong>${datos.personas}</strong></li>
        <li><span>A nombre de</span><strong>${esc(datos.nombre)}</strong></li>
      </ul>
      <p class="ayuda">Toma una captura de pantalla como comprobante.</p>
      <button class="btn btn-full" id="btn-volver">Volver al inicio</button>
    </div>`;
  $('#btn-volver').addEventListener('click', async () => {
    cerrarModal();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    await cargarMesas(); // refresca el estado Libre/Ocupado de las tarjetas
  });
}
