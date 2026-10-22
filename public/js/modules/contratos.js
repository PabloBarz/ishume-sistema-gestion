import { http, formatDate, formatNumber, clearErrors, setError } from '../utils.js';

export function init() {
  // Referencias locales: una respuesta pendiente no modifica otra vista al navegar.
  const form = document.getElementById('contratoForm');
  const input = document.getElementById('contratoId');
  const button = document.getElementById('contratoConsultar');
  const status = document.getElementById('contratoEstado');
  const result = document.getElementById('contratoResultado');
  const number = document.getElementById('contratoNumero');
  const client = document.getElementById('contratoCliente');
  const date = document.getElementById('contratoFecha');
  const rows = document.getElementById('contratoModelos');
  let pending = false;

  input.addEventListener('input', () => clearErrors(['contratoId']));
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (pending) return;
    clearErrors(['contratoId']);
    result.hidden = true;
    rows.replaceChildren();
    const id = input.value.trim();
    if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) <= 0) {
      setError('contratoId', 'err-contratoId', 'Ingresa un ID entero mayor que cero.');
      status.textContent = 'Revisa el ID del contrato.';
      input.focus();
      return;
    }

    pending = true;
    button.disabled = true;
    form.setAttribute('aria-busy', 'true');
    status.textContent = `Consultando contrato ${id}…`;
    try {
      const { data } = await http(`/api/contratos?id=${encodeURIComponent(id)}`);
      if (!form.isConnected) return;
      number.textContent = `#${data.id_contrato}`;
      client.textContent = data.cliente;
      date.textContent = data.fecha_entrega ? formatDate(data.fecha_entrega) || data.fecha_entrega : 'Sin fecha de entrega registrada';
      for (const producto of data.productos) {
        const row = document.createElement('tr');
        const model = document.createElement('td');
        const quantity = document.createElement('td');
        model.textContent = producto.modelo;
        quantity.textContent = formatNumber(producto.cantidad);
        quantity.className = 'cell-value';
        row.append(model, quantity);
        rows.append(row);
      }
      if (!data.productos.length) {
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.colSpan = 2;
        cell.textContent = 'Este contrato no tiene modelos registrados.';
        row.append(cell);
        rows.append(row);
      }
      result.hidden = false;
      status.textContent = `Contrato ${data.id_contrato} consultado correctamente.`;
    } catch (error) {
      if (form.isConnected) status.textContent = error.message;
    } finally {
      pending = false;
      button.disabled = false;
      form.setAttribute('aria-busy', 'false');
    }
  });
}
