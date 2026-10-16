// Conecta los componentes demostrativos con las utilidades compartidas de ISHUME.
import {
  clearErrors,
  closeOverlay,
  formatCurrencyPEN,
  formatDate,
  formatNumber,
  openOverlay,
  setError,
  showToast,
  validateRequiredFields,
} from '../utils.js';

const fields = [
  { id: 'exampleDescription', label: 'La descripción es obligatoria.' },
  { id: 'exampleCategory', label: 'La categoría es obligatoria.' },
  { id: 'exampleQuantity', label: 'La cantidad es obligatoria.' },
  { id: 'exampleAmount', label: 'El importe es obligatorio.' },
];

// Cuando exista una API, un módulo podrá importar http y usar: await http('/api/recurso').
function showFormattedExamples() {
  document.getElementById('exampleFormattedDate').textContent = formatDate('2026-10-16');
  document.getElementById('exampleFormattedNumber').textContent = formatNumber(1234.5);
  document.getElementById('exampleFormattedCurrency').textContent = formatCurrencyPEN(1234.5);
}

function appendExampleRow(values) {
  const row = document.createElement('tr');
  const description = document.createElement('td');
  const title = document.createElement('span');
  const detail = document.createElement('span');
  title.className = 'cell-primary';
  title.textContent = values.description;
  detail.className = 'cell-secondary';
  detail.textContent = 'Registro agregado en esta demostración';
  description.append(title, detail);

  const category = document.createElement('td');
  const badge = document.createElement('span');
  badge.className = 'badge badge-info';
  badge.textContent = values.category;
  category.append(badge);

  const quantity = document.createElement('td');
  quantity.className = 'cell-value';
  quantity.textContent = formatNumber(values.quantity);

  const amount = document.createElement('td');
  amount.className = 'cell-value';
  amount.textContent = formatCurrencyPEN(values.amount);

  const date = document.createElement('td');
  date.textContent = formatDate(new Date());
  row.append(description, category, quantity, amount, date);
  document.getElementById('exampleTableRows').append(row);
}

function handleSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = Object.fromEntries(new FormData(form));
  const missingFields = validateRequiredFields(values);
  clearErrors(fields.map(({ id }) => id));

  if (missingFields.length) {
    fields
      .filter(({ id }) => missingFields.includes(document.getElementById(id).name))
      .forEach(({ id, label }) => setError(id, `err-${id}`, label));
    showToast('Completa los campos obligatorios del formulario.', 'warning');
    return;
  }

  appendExampleRow(values);
  form.reset();
  showToast('El registro de demostración se agregó a la tabla.', 'success');
}

// Inicializa eventos en los elementos recién insertados por el router.
export function init() {
  const form = document.getElementById('exampleForm');
  if (!form) throw new Error('No se encontró el formulario de demostración.');

  showFormattedExamples();

  document.querySelectorAll('[data-toast]').forEach((button) => {
    button.addEventListener('click', () => {
      const type = button.dataset.toast;
      showToast(`Notificación de ${type} de demostración.`, type);
    });
  });

  document.getElementById('openExampleModal').addEventListener('click', () => openOverlay('exampleModal'));
  document.querySelectorAll('[data-close-example-modal]').forEach((button) => {
    button.addEventListener('click', () => closeOverlay('exampleModal'));
  });

  const modal = document.getElementById('exampleModal');
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeOverlay('exampleModal');
  });

  fields.forEach(({ id }) => {
    const field = document.getElementById(id);
    field.addEventListener(field.tagName === 'SELECT' ? 'change' : 'input', () => clearErrors([id]));
  });
  form.addEventListener('submit', handleSubmit);
}
