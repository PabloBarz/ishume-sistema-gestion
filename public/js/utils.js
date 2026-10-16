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
