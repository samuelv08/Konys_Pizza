/* =====================================================================
 * admin.js — Lógica del módulo administrador (admin.html)
 * ---------------------------------------------------------------------
 * Secciones: Mesas, Horarios, Reservas, Carta.
 * Acceso: contraseña simple validada en el navegador (RF-08).
 *
 * ⚠ LIMITACIÓN DE SEGURIDAD: esta contraseña es visible para quien
 *   inspeccione el código, y el panel usa la misma anon key que los
 *   clientes. Es una protección básica, válida para el proyecto
 *   académico. En producción hay que usar Supabase Auth.
 * ===================================================================== */

const SESSION_KEY = 'konys_admin_ok';
const ORDEN_DIAS = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const CATEGORIAS_ADMIN = { pizzas: 'Pizzas', entradas: 'Entradas', postres: 'Postres', bebidas: 'Bebidas' };
const ZONAS_ADMIN = { terraza: 'Terraza', salon: 'Salón' };
const ESTADOS_RESERVA = { confirmada: 'Confirmada', cancelada: 'Cancelada', completada: 'Completada' };
const POR_PAGINA = 10;

let cacheMesas = [];   // mesas cargadas (para filtros y formularios)
let cachePlatos = [];  // platos cargados
const filtrosReservas = { fecha: '', mesa: '', estado: '', pagina: 0 };

const cargandoHTML = '<p class="vacio">Cargando…</p>';

// ---------------------------------------------------------------------
// Acceso (RF-08)
// ---------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  if (!CONFIG_OK) {
    $('#login-error').textContent = 'Falta configurar js/config.js con tus datos de Supabase.';
  }

  $('#login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const clave = $('#clave').value;
    if (!CONFIG_OK) return;
    if (!CFG.ADMIN_PASSWORD) {
      $('#login-error').textContent = 'No hay contraseña configurada (ADMIN_PASSWORD).';
      return;
    }
    if (clave !== CFG.ADMIN_PASSWORD) {
      $('#login-error').textContent = 'Contraseña incorrecta.';
      $('#clave').select();
      return;
    }
    sessionStorage.setItem(SESSION_KEY, '1'); // la sesión dura mientras la pestaña esté abierta
    entrar();
  });

  $('#btn-salir').addEventListener('click', salir);

  $$('.nav-admin [data-vista]').forEach((b) =>
    b.addEventListener('click', () => mostrarVista(b.dataset.vista)));

  // Cierre del modal: clic fuera, botón con data-cerrar o tecla Esc
  const modal = $('#modal');
  modal.addEventListener('click', (e) => {
    if (e.target === modal || e.target.closest('[data-cerrar]')) cerrarModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) cerrarModal();
  });

  if (CONFIG_OK && sessionStorage.getItem(SESSION_KEY) === '1') entrar();
});

function entrar() {
  $('#login').hidden = true;
  $('#app').hidden = false;
  mostrarVista('mesas');
}

function salir() {
  sessionStorage.removeItem(SESSION_KEY);
  $('#app').hidden = true;
  $('#login').hidden = false;
  $('#clave').value = '';
  $('#login-error').textContent = '';
}

function mostrarVista(nombre) {
  $$('.nav-admin [data-vista]').forEach((b) => b.classList.toggle('activa', b.dataset.vista === nombre));
  const vistas = { mesas: vistaMesas, horarios: vistaHorarios, reservas: vistaReservas, carta: vistaCarta };
  $('#vista').innerHTML = cargandoHTML;
  vistas[nombre]();
}

// ---------------------------------------------------------------------
// Modal genérico
// ---------------------------------------------------------------------
function abrirModal(html) {
  $('#modal-contenido').innerHTML = html;
  $('#modal').hidden = false;
  document.body.classList.add('sin-scroll');
  const primero = $('#modal-contenido input, #modal-contenido select, #modal-contenido textarea');
  if (primero) primero.focus();
}

function cerrarModal() {
  $('#modal').hidden = true;
  document.body.classList.remove('sin-scroll');
  $('#modal-contenido').innerHTML = '';
}

const cabeceraModal = (titulo) => `
  <div class="modal-header">
    <h3>${esc(titulo)}</h3>
    <button class="modal-x" data-cerrar aria-label="Cerrar"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
  </div>`;

const opciones = (obj, actual) => Object.entries(obj)
  .map(([k, v]) => `<option value="${k}" ${k === actual ? 'selected' : ''}>${esc(v)}</option>`).join('');

// =====================================================================
// MESAS (RF-09, RF-10, RF-13)
// =====================================================================
async function vistaMesas() {
  $('#vista').innerHTML = `
    <div class="toolbar">
      <h2>Mesas</h2>
      <button class="btn" id="btn-nueva-mesa">+ Nueva mesa</button>
    </div>
    <div id="tabla-mesas" class="tabla-wrap">${cargandoHTML}</div>`;
  $('#btn-nueva-mesa').addEventListener('click', () => formMesa());
  await recargarMesas();
}

async function recargarMesas() {
  const cont = $('#tabla-mesas');
  const { data, error } = await db.from('mesas').select('*');
  if (error) { cont.innerHTML = `<p class="error">${esc(mensajeError(error))}</p>`; return; }

  cacheMesas = (data || []).sort(porNombre);
  if (!cacheMesas.length) {
    cont.innerHTML = '<p class="vacio">Aún no hay mesas. Crea la primera con "+ Nueva mesa".</p>';
    return;
  }

  cont.innerHTML = `
    <table class="tabla">
      <thead><tr><th>Mesa</th><th>Zona</th><th>Capacidad</th><th>Estado</th><th>Acciones</th></tr></thead>
      <tbody>
        ${cacheMesas.map((m) => `
          <tr>
            <td data-label="Mesa"><strong>${esc(m.nombre)}</strong></td>
            <td data-label="Zona">${esc(ZONAS_ADMIN[m.zona] || m.zona)}</td>
            <td data-label="Capacidad">${m.capacidad} personas</td>
            <td data-label="Estado">
              <label class="switch" title="Activar o desactivar">
                <input type="checkbox" data-toggle="${esc(m.id)}" ${m.activa ? 'checked' : ''}
                       aria-label="Mesa ${esc(m.nombre)} activa">
                <span></span>
              </label>
              <small class="estado-txt">${m.activa ? 'Activa' : 'Inactiva'}</small>
            </td>
            <td data-label="Acciones" class="acciones">
              <button class="btn btn-sm btn-outline" data-editar="${esc(m.id)}">Editar</button>
              <button class="btn btn-sm btn-danger" data-borrar="${esc(m.id)}">Borrar</button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;

  // Activar / desactivar (el cambio se refleja a los clientes)
  $$('[data-toggle]', cont).forEach((chk) => chk.addEventListener('change', async () => {
    const { error: err } = await db.from('mesas').update({ activa: chk.checked }).eq('id', chk.dataset.toggle);
    if (err) { toast(mensajeError(err), 'error'); }
    else { toast(chk.checked ? 'Mesa activada.' : 'Mesa desactivada.'); }
    recargarMesas();
  }));

  $$('[data-editar]', cont).forEach((b) => b.addEventListener('click', () =>
    formMesa(cacheMesas.find((m) => m.id === b.dataset.editar))));

  $$('[data-borrar]', cont).forEach((b) => b.addEventListener('click', async () => {
    const mesa = cacheMesas.find((m) => m.id === b.dataset.borrar);
    if (!confirm(`¿Borrar la mesa "${mesa.nombre}"? Esta acción no se puede deshacer.`)) return;
    const { error: err } = await db.from('mesas').delete().eq('id', mesa.id);
    if (err) {
      toast(err.code === '23503'
        ? 'No se puede borrar: la mesa tiene reservas en su historial. Desactívala en su lugar.'
        : mensajeError(err), 'error');
    } else {
      toast('Mesa eliminada.');
    }
    recargarMesas();
  }));
}

/** Formulario para crear (sin argumento) o editar una mesa. */
function formMesa(mesa = null) {
  abrirModal(`
    ${cabeceraModal(mesa ? 'Editar mesa' : 'Nueva mesa')}
    <form id="form-mesa" class="form-modal" novalidate>
      <label>Nombre o número
        <input id="m-nombre" type="text" maxlength="40" value="${esc(mesa?.nombre || '')}" required>
      </label>
      <label>Zona
        <select id="m-zona">${opciones(ZONAS_ADMIN, mesa?.zona || 'salon')}</select>
      </label>
      <label>Capacidad (personas)
        <input id="m-capacidad" type="number" min="1" max="50" value="${mesa?.capacidad ?? 4}" required>
      </label>
      <label>URL de la foto (opcional)
        <input id="m-foto" type="url" placeholder="https://..." value="${esc(mesa?.foto_url || '')}">
      </label>
      <p id="m-error" class="error" role="alert"></p>
      <div class="modal-acciones">
        <button type="button" class="btn btn-outline" data-cerrar>Cancelar</button>
        <button type="submit" class="btn">Guardar</button>
      </div>
    </form>`);

  $('#form-mesa').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#m-error');
    const nombre = $('#m-nombre').value.trim();
    const capacidad = parseInt($('#m-capacidad').value, 10);
    const fotoTxt = $('#m-foto').value.trim();

    if (!nombre) { err.textContent = 'El nombre es obligatorio.'; return; }
    if (!Number.isInteger(capacidad) || capacidad < 1 || capacidad > 50) {
      err.textContent = 'La capacidad debe ser un número entre 1 y 50.'; return;
    }
    if (fotoTxt && !urlSegura(fotoTxt)) { err.textContent = 'La foto debe ser una URL que empiece por http:// o https://.'; return; }

    const payload = { nombre, zona: $('#m-zona').value, capacidad, foto_url: fotoTxt || null };
    const consulta = mesa
      ? db.from('mesas').update(payload).eq('id', mesa.id)
      : db.from('mesas').insert(payload);
    const { error } = await consulta;

    if (error) {
      err.textContent = error.code === '23505' ? 'Ya existe una mesa con ese nombre.' : mensajeError(error);
      return;
    }
    cerrarModal();
    toast(mesa ? 'Mesa actualizada.' : 'Mesa creada.');
    recargarMesas();
  });
}

// =====================================================================
// HORARIOS (RF-11)
// =====================================================================
async function vistaHorarios() {
  const { data, error } = await db.from('horarios').select('*');
  if (error) { $('#vista').innerHTML = `<p class="error">${esc(mensajeError(error))}</p>`; return; }

  const filas = (data || []).sort((a, b) =>
    ORDEN_DIAS.indexOf(a.dia_semana) - ORDEN_DIAS.indexOf(b.dia_semana) || a.jornada.localeCompare(b.jornada));

  if (!filas.length) {
    $('#vista').innerHTML = '<div class="toolbar"><h2>Horarios</h2></div><p class="vacio">No hay horarios en la base de datos. Ejecuta el script SQL con los datos de ejemplo.</p>';
    return;
  }

  $('#vista').innerHTML = `
    <div class="toolbar"><h2>Horarios</h2></div>
    <p class="seccion-sub">Define la jornada de cada día y la duración de cada reserva. Los cupos se generan solos.
      Desactiva una fila para dejar ese día o jornada sin servicio.</p>
    <div class="tabla-wrap">
      <table class="tabla" id="tabla-horarios">
        <thead><tr><th>Día</th><th>Jornada</th><th>Inicio</th><th>Fin</th><th>Duración (min)</th><th>Cupos</th><th>Activo</th><th></th></tr></thead>
        <tbody>
          ${filas.map((h) => `
            <tr data-id="${esc(h.id)}" data-jornada="${esc(h.jornada)}">
              <td data-label="Día"><strong>${esc(DIAS_TXT[h.dia_semana])}</strong></td>
              <td data-label="Jornada">${h.jornada === 'almuerzo' ? 'Almuerzo' : 'Noche'}</td>
              <td data-label="Inicio"><input type="time" class="h-ini" value="${h.hora_inicio.slice(0, 5)}"></td>
              <td data-label="Fin"><input type="time" class="h-fin" value="${h.hora_fin.slice(0, 5)}"></td>
              <td data-label="Duración"><input type="number" class="h-dur" min="15" max="240" step="5" value="${h.duracion_slot}"></td>
              <td data-label="Cupos" class="h-cupos">${contarCupos(h.hora_inicio, h.hora_fin, h.duracion_slot)}</td>
              <td data-label="Activo">
                <label class="switch"><input type="checkbox" class="h-act" ${h.activo ? 'checked' : ''} aria-label="Activo"><span></span></label>
              </td>
              <td><button class="btn btn-sm h-guardar">Guardar</button></td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  const tabla = $('#tabla-horarios');

  // Recalcula los cupos mientras se edita
  tabla.addEventListener('input', (e) => {
    const tr = e.target.closest('tr');
    if (!tr) return;
    const ini = $('.h-ini', tr).value, fin = $('.h-fin', tr).value, dur = parseInt($('.h-dur', tr).value, 10);
    $('.h-cupos', tr).textContent = (ini && fin && dur) ? contarCupos(ini, fin, dur) : '—';
  });

  tabla.addEventListener('click', async (e) => {
    const btn = e.target.closest('.h-guardar');
    if (!btn) return;
    const tr = btn.closest('tr');
    const ini = $('.h-ini', tr).value;
    const fin = $('.h-fin', tr).value;
    const dur = parseInt($('.h-dur', tr).value, 10);

    if (!ini || !fin) { toast('Completa la hora de inicio y de fin.', 'error'); return; }
    if (aMin(fin) <= aMin(ini)) { toast('La hora de fin debe ser mayor que la de inicio.', 'error'); return; }
    if (!Number.isInteger(dur) || dur < 15 || dur > 240) { toast('La duración debe estar entre 15 y 240 minutos.', 'error'); return; }
    if (aMin(fin) - aMin(ini) < dur) { toast('La duración del cupo es mayor que la jornada.', 'error'); return; }

    btn.disabled = true;
    const { error: err } = await db.from('horarios').update({
      hora_inicio: ini, hora_fin: fin, duracion_slot: dur, activo: $('.h-act', tr).checked,
    }).eq('id', tr.dataset.id);
    btn.disabled = false;

    if (err) toast(mensajeError(err), 'error');
    else toast('Horario guardado.');
  });
}

/** Cantidad de cupos que caben en una jornada. */
function contarCupos(inicio, fin, duracion) {
  return generarSlots([{ hora_inicio: inicio, hora_fin: fin, duracion_slot: duracion, activo: true, jornada: '' }]).length;
}

// =====================================================================
// RESERVAS (RF-12)
// =====================================================================
async function vistaReservas() {
  // Mesas para el filtro
  const { data: mesas } = await db.from('mesas').select('id, nombre');
  cacheMesas = (mesas || []).sort(porNombre);

  $('#vista').innerHTML = `
    <div class="toolbar"><h2>Reservas</h2></div>
    <form id="filtros" class="filtros">
      <label>Fecha
        <input type="date" id="fl-fecha" value="${esc(filtrosReservas.fecha)}">
      </label>
      <label>Mesa
        <select id="fl-mesa">
          <option value="">Todas</option>
          ${cacheMesas.map((m) => `<option value="${esc(m.id)}" ${m.id === filtrosReservas.mesa ? 'selected' : ''}>${esc(m.nombre)}</option>`).join('')}
        </select>
      </label>
      <label>Estado
        <select id="fl-estado">
          <option value="">Todos</option>
          ${opciones(ESTADOS_RESERVA, filtrosReservas.estado)}
        </select>
      </label>
      <div class="filtros-btn">
        <button type="submit" class="btn">Filtrar</button>
        <button type="button" class="btn btn-outline" id="fl-limpiar">Limpiar</button>
      </div>
    </form>
    <div id="tabla-reservas" class="tabla-wrap">${cargandoHTML}</div>
    <div id="paginacion" class="paginacion"></div>`;

  $('#filtros').addEventListener('submit', (e) => {
    e.preventDefault();
    filtrosReservas.fecha = $('#fl-fecha').value;
    filtrosReservas.mesa = $('#fl-mesa').value;
    filtrosReservas.estado = $('#fl-estado').value;
    filtrosReservas.pagina = 0;
    recargarReservas();
  });
  $('#fl-limpiar').addEventListener('click', () => {
    Object.assign(filtrosReservas, { fecha: '', mesa: '', estado: '', pagina: 0 });
    vistaReservas();
  });

  await recargarReservas();
}

async function recargarReservas() {
  const cont = $('#tabla-reservas');
  const desde = filtrosReservas.pagina * POR_PAGINA;

  let q = db.from('reservas')
    .select('*, mesas(nombre)', { count: 'exact' })
    .order('fecha', { ascending: false })
    .order('hora_inicio', { ascending: true })
    .range(desde, desde + POR_PAGINA - 1);

  if (filtrosReservas.fecha) q = q.eq('fecha', filtrosReservas.fecha);
  if (filtrosReservas.mesa) q = q.eq('mesa_id', filtrosReservas.mesa);
  if (filtrosReservas.estado) q = q.eq('estado', filtrosReservas.estado);

  const { data, error, count } = await q;
  if (error) { cont.innerHTML = `<p class="error">${esc(mensajeError(error))}</p>`; $('#paginacion').innerHTML = ''; return; }

  if (!data.length) {
    cont.innerHTML = '<p class="vacio">No hay reservas con esos filtros.</p>';
    $('#paginacion').innerHTML = '';
    return;
  }

  cont.innerHTML = `
    <table class="tabla">
      <thead><tr><th>Cliente</th><th>Contacto</th><th>Mesa</th><th>Fecha</th><th>Hora</th><th>Personas</th><th>Estado</th></tr></thead>
      <tbody>
        ${data.map((r) => `
          <tr>
            <td data-label="Cliente"><strong>${esc(r.cliente_nombre)}</strong></td>
            <td data-label="Contacto">${esc(r.cliente_contacto || '—')}</td>
            <td data-label="Mesa">${esc(r.mesas?.nombre || '—')}</td>
            <td data-label="Fecha">${esc(formatFechaCorta(r.fecha))}</td>
            <td data-label="Hora">${formatHora12(r.hora_inicio)} a ${formatHora12(r.hora_fin)}</td>
            <td data-label="Personas">${r.num_personas}</td>
            <td data-label="Estado">
              <select class="estado-sel ${esc(r.estado)}" data-id="${esc(r.id)}" aria-label="Estado de la reserva">
                ${opciones(ESTADOS_RESERVA, r.estado)}
              </select>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;

  // Cambiar el estado (p. ej. cancelar libera el cupo para otros clientes)
  $$('.estado-sel', cont).forEach((sel) => sel.addEventListener('change', async () => {
    const { error: err } = await db.from('reservas').update({ estado: sel.value }).eq('id', sel.dataset.id);
    if (err) { toast(mensajeError(err), 'error'); }
    else { toast('Estado actualizado.'); }
    recargarReservas();
  }));

  // Paginación
  const totalPaginas = Math.max(1, Math.ceil(count / POR_PAGINA));
  const pag = $('#paginacion');
  pag.innerHTML = `
    <button class="btn btn-sm btn-outline" id="pag-ant" ${filtrosReservas.pagina === 0 ? 'disabled' : ''}>Anterior</button>
    <span>Página ${filtrosReservas.pagina + 1} de ${totalPaginas} · ${count} reservas</span>
    <button class="btn btn-sm btn-outline" id="pag-sig" ${filtrosReservas.pagina + 1 >= totalPaginas ? 'disabled' : ''}>Siguiente</button>`;
  $('#pag-ant').addEventListener('click', () => { filtrosReservas.pagina--; recargarReservas(); });
  $('#pag-sig').addEventListener('click', () => { filtrosReservas.pagina++; recargarReservas(); });
}

// =====================================================================
// CARTA (RF-14)
// =====================================================================
async function vistaCarta() {
  $('#vista').innerHTML = `
    <div class="toolbar">
      <h2>Carta</h2>
      <button class="btn" id="btn-nuevo-plato">+ Nuevo plato</button>
    </div>
    <div id="tabla-platos" class="tabla-wrap">${cargandoHTML}</div>`;
  $('#btn-nuevo-plato').addEventListener('click', () => formPlato());
  await recargarPlatos();
}

async function recargarPlatos() {
  const cont = $('#tabla-platos');
  const { data, error } = await db.from('platos').select('*');
  if (error) { cont.innerHTML = `<p class="error">${esc(mensajeError(error))}</p>`; return; }

  const orden = Object.keys(CATEGORIAS_ADMIN);
  cachePlatos = (data || []).sort((a, b) =>
    orden.indexOf(a.categoria) - orden.indexOf(b.categoria) || a.nombre.localeCompare(b.nombre, 'es'));

  if (!cachePlatos.length) {
    cont.innerHTML = '<p class="vacio">La carta está vacía. Agrega el primer plato con "+ Nuevo plato".</p>';
    return;
  }

  cont.innerHTML = `
    <table class="tabla">
      <thead><tr><th>Plato</th><th>Categoría</th><th>Precio</th><th>Visible</th><th>Acciones</th></tr></thead>
      <tbody>
        ${cachePlatos.map((p) => `
          <tr class="${p.disponible ? '' : 'fila-oculta'}">
            <td data-label="Plato">
              <strong>${esc(p.nombre)}</strong>
              ${p.descripcion ? `<br><small class="muted">${esc(p.descripcion)}</small>` : ''}
            </td>
            <td data-label="Categoría">${esc(CATEGORIAS_ADMIN[p.categoria] || p.categoria)}</td>
            <td data-label="Precio">${formatCOP(p.precio)}</td>
            <td data-label="Visible"><span class="badge ${p.disponible ? 'libre' : 'cerrado'}">${p.disponible ? 'Visible' : 'Oculto'}</span></td>
            <td data-label="Acciones" class="acciones">
              <button class="btn btn-sm btn-outline" data-editar="${esc(p.id)}">Editar</button>
              <button class="btn btn-sm btn-outline" data-ocultar="${esc(p.id)}">${p.disponible ? 'Ocultar' : 'Mostrar'}</button>
              <button class="btn btn-sm btn-danger" data-borrar="${esc(p.id)}">Eliminar</button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;

  $$('[data-editar]', cont).forEach((b) => b.addEventListener('click', () =>
    formPlato(cachePlatos.find((p) => p.id === b.dataset.editar))));

  $$('[data-ocultar]', cont).forEach((b) => b.addEventListener('click', async () => {
    const plato = cachePlatos.find((p) => p.id === b.dataset.ocultar);
    const { error: err } = await db.from('platos').update({ disponible: !plato.disponible }).eq('id', plato.id);
    if (err) toast(mensajeError(err), 'error');
    else toast(plato.disponible ? 'Plato oculto para los clientes.' : 'Plato visible para los clientes.');
    recargarPlatos();
  }));

  $$('[data-borrar]', cont).forEach((b) => b.addEventListener('click', async () => {
    const plato = cachePlatos.find((p) => p.id === b.dataset.borrar);
    if (!confirm(`¿Eliminar "${plato.nombre}" de la carta? Esta acción no se puede deshacer.`)) return;
    const { error: err } = await db.from('platos').delete().eq('id', plato.id);
    if (err) toast(mensajeError(err), 'error');
    else toast('Plato eliminado.');
    recargarPlatos();
  }));
}

/** Formulario para crear (sin argumento) o editar un plato. */
function formPlato(plato = null) {
  abrirModal(`
    ${cabeceraModal(plato ? 'Editar plato' : 'Nuevo plato')}
    <form id="form-plato" class="form-modal" novalidate>
      <label>Nombre
        <input id="p-nombre" type="text" maxlength="80" value="${esc(plato?.nombre || '')}" required>
      </label>
      <label>Categoría
        <select id="p-categoria">${opciones(CATEGORIAS_ADMIN, plato?.categoria || 'pizzas')}</select>
      </label>
      <label>Descripción
        <textarea id="p-desc" rows="3" maxlength="300">${esc(plato?.descripcion || '')}</textarea>
      </label>
      <label>Precio en COP
        <input id="p-precio" type="number" min="0" step="500" value="${plato?.precio ?? ''}" required>
      </label>
      <label class="check-fila">
        <input id="p-disp" type="checkbox" ${plato ? (plato.disponible ? 'checked' : '') : 'checked'}>
        Visible para los clientes
      </label>
      <p id="p-error" class="error" role="alert"></p>
      <div class="modal-acciones">
        <button type="button" class="btn btn-outline" data-cerrar>Cancelar</button>
        <button type="submit" class="btn">Guardar</button>
      </div>
    </form>`);

  $('#form-plato').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#p-error');
    const nombre = $('#p-nombre').value.trim();
    const precio = parseInt($('#p-precio').value, 10);

    if (!nombre) { err.textContent = 'El nombre es obligatorio.'; return; }
    if (!Number.isInteger(precio) || precio < 0) { err.textContent = 'Escribe un precio válido (número entero en COP).'; return; }

    const payload = {
      nombre,
      categoria: $('#p-categoria').value,
      descripcion: $('#p-desc').value.trim() || null,
      precio,
      disponible: $('#p-disp').checked,
    };
    const consulta = plato
      ? db.from('platos').update(payload).eq('id', plato.id)
      : db.from('platos').insert(payload);
    const { error } = await consulta;

    if (error) { err.textContent = mensajeError(error); return; }
    cerrarModal();
    toast(plato ? 'Plato actualizado.' : 'Plato agregado.');
    recargarPlatos();
  });
}
