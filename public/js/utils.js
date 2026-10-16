// Reúne funciones pequeñas de formato y validación compartidas por las vistas.

const formatoFecha = new Intl.DateTimeFormat('es-PE', {
  dateStyle: 'medium',
});

const formatoNumero = new Intl.NumberFormat('es-PE', {
  maximumFractionDigits: 3,
});

const formatoSoles = new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN',
});

function convertirNumero(valor) {
  if (typeof valor === 'string' && valor.trim() === '') return null;
  if (valor === null || valor === undefined) return null;

  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

// Devuelve una fecha legible; si el valor no es válido, devuelve una cadena vacía.
export function formatDate(valor) {
  let fecha = valor;

  if (!(fecha instanceof Date) && typeof valor === 'string') {
    const soloFecha = valor.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (soloFecha) {
      const [, anio, mes, dia] = soloFecha;
      fecha = new Date(Number(anio), Number(mes) - 1, Number(dia));
      if (fecha.getFullYear() !== Number(anio) || fecha.getMonth() !== Number(mes) - 1 || fecha.getDate() !== Number(dia)) return '';
    }
  }

  fecha = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(fecha.getTime())) return '';

  return formatoFecha.format(fecha);
}

// Formatea números con la configuración regional peruana.
export function formatNumber(valor) {
  const numero = convertirNumero(valor);
  return numero === null ? '' : formatoNumero.format(numero);
}

// Formatea importes en soles peruanos.
export function formatCurrencyPEN(valor) {
  const numero = convertirNumero(valor);
  return numero === null ? '' : formatoSoles.format(numero);
}

// Retorna los nombres de las propiedades cuyos valores obligatorios están vacíos.
export function validateRequiredFields(valores) {
  return Object.entries(valores).filter(([, valor]) => {
    return valor === null || valor === undefined || (typeof valor === 'string' && valor.trim() === '');
  }).map(([nombre]) => nombre);
}

const tiposToast = {
  success: { icono: 'bi bi-check-circle-fill', rol: 'status' },
  error: { icono: 'bi bi-exclamation-octagon-fill', rol: 'alert' },
  warning: { icono: 'bi bi-exclamation-triangle-fill', rol: 'status' },
  info: { icono: 'bi bi-info-circle-fill', rol: 'status' },
};

let contenedorToast;
const toastsActivos = new Map();

function obtenerContenedorToast() {
  if (contenedorToast?.isConnected) return contenedorToast;

  contenedorToast = document.createElement('div');
  contenedorToast.className = 'toast-container';
  contenedorToast.setAttribute('role', 'region');
  contenedorToast.setAttribute('aria-label', 'Notificaciones');
  document.body.append(contenedorToast);
  return contenedorToast;
}

function cerrarToast(clave, elemento, temporizador) {
  if (temporizador !== null) clearTimeout(temporizador);
  toastsActivos.delete(clave);
  elemento.remove();

  if (contenedorToast && !contenedorToast.children.length) {
    contenedorToast.remove();
    contenedorToast = null;
  }
}

// Muestra una notificación segura, deduplicada y con cierre manual o automático.
export function showToast(message, type = 'info', duration = 4000) {
  const texto = String(message ?? '').trim();
  if (!texto) return null;

  const tipo = Object.hasOwn(tiposToast, type) ? type : 'info';
  const clave = `${tipo}:${texto.toLocaleLowerCase('es-PE').replace(/\s+/g, ' ')}`;
  const tiempo = Number(duration);
  // Una duración de cero mantiene la notificación hasta que se cierre manualmente.
  const duracion = duration === 0 ? 0 : Number.isFinite(tiempo) && tiempo > 0 ? tiempo : 4000;
  const existente = toastsActivos.get(clave);

  if (existente) {
    if (existente.temporizador !== null) clearTimeout(existente.temporizador);
    existente.temporizador = duracion ? setTimeout(() => cerrarToast(clave, existente.elemento, existente.temporizador), duracion) : null;
    return existente.elemento;
  }

  const elemento = document.createElement('div');
  elemento.className = `toast-item toast-${tipo}`;
  elemento.setAttribute('role', tiposToast[tipo].rol);
  elemento.setAttribute('aria-atomic', 'true');

  const icono = document.createElement('i');
  icono.className = `toast-icon toast-icon-${tipo} ${tiposToast[tipo].icono}`;
  icono.setAttribute('aria-hidden', 'true');

  const mensaje = document.createElement('span');
  mensaje.className = 'toast-message';
  mensaje.textContent = texto;

  const botonCerrar = document.createElement('button');
  botonCerrar.className = 'toast-close';
  botonCerrar.type = 'button';
  botonCerrar.setAttribute('aria-label', 'Cerrar notificación');

  const iconoCerrar = document.createElement('i');
  iconoCerrar.className = 'bi bi-x-lg';
  iconoCerrar.setAttribute('aria-hidden', 'true');
  botonCerrar.append(iconoCerrar);

  elemento.append(icono, mensaje, botonCerrar);
  const registro = { elemento, temporizador: null };
  toastsActivos.set(clave, registro);
  botonCerrar.addEventListener('click', () => cerrarToast(clave, elemento, registro.temporizador));
  obtenerContenedorToast().append(elemento);

  if (duracion) registro.temporizador = setTimeout(() => cerrarToast(clave, elemento, registro.temporizador), duracion);

  return elemento;
}

const modalTriggers = new WeakMap();

// Abre un modal de la vista y envía el foco a su primer control.
export function openOverlay(id) {
  const overlay = document.getElementById(id);
  if (!overlay || overlay.classList.contains('open')) return;

  modalTriggers.set(overlay, document.activeElement);
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');

  const panel = overlay.querySelector('.modal-panel');
  panel?.setAttribute('role', 'dialog');
  panel?.setAttribute('aria-modal', 'true');
  panel?.querySelector('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])')?.focus();
}

// Cierra el modal y devuelve el foco al control que lo abrió.
export function closeOverlay(id) {
  const overlay = document.getElementById(id);
  if (!overlay) return;

  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  modalTriggers.get(overlay)?.focus();
  modalTriggers.delete(overlay);
}
