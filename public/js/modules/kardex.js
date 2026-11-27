import { http, formatNumber } from '../utils.js';
import { createCell, createNumericCell, createTable } from '../components/inventoryTable.js';

const dateTimeFormatter = new Intl.DateTimeFormat('es-PE', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateTimeFormatter.format(date);
}

function formatUnits(value) {
  return formatNumber(value) || '—';
}

function createMovementCell(type) {
  const cell = document.createElement('td');
  const badge = document.createElement('span');
  const isEntry = type === 'Entrada';
  badge.className = `badge ${isEntry ? 'badge-success' : 'badge-danger'} kardex-movement-badge`;
  badge.textContent = type;
  const icon = document.createElement('i');
  icon.className = `bi ${isEntry ? 'bi-arrow-down-left' : 'bi-arrow-up-right'}`;
  icon.setAttribute('aria-hidden', 'true');
  cell.append(icon, badge);
  return cell;
}

function createQuantityCell(movement) {
  const sign = movement.tipo === 'Entrada' ? '+' : '−';
  return createNumericCell(`${sign}${formatUnits(movement.cantidad)}`, movement.tipo === 'Entrada'
    ? 'kardex-quantity-entry' : 'kardex-quantity-exit');
}

function createRows(movements) {
  return movements.map((movement) => [
    createCell(formatDateTime(movement.fecha_movimiento)),
    createCell(movement.nombre_modelo),
    createMovementCell(movement.tipo),
    createQuantityCell(movement),
    createCell(movement.documento_origen, movement.tipo_origen),
    createCell(movement.descripcion),
    createNumericCell(formatUnits(movement.saldo_modelo), 'kardex-balance'),
  ]);
}

function errorMessage(error) {
  if (error.status === 401) return 'Tu sesión expiró. Inicia sesión nuevamente para consultar el Kardex.';
  if (error.status === 403) return 'No tienes permiso para consultar el Kardex.';
  return error.message || 'No se pudo conectar con el servidor. Intenta nuevamente.';
}

export async function init() {
  const root = document.querySelector('.kardex-page');
  if (!root) return;

  const search = root.querySelector('#kardexSearch');
  const modelFilter = root.querySelector('#kardexModelFilter');
  const typeFilter = root.querySelector('#kardexTypeFilter');
  const dateFrom = root.querySelector('#kardexDateFrom');
  const dateTo = root.querySelector('#kardexDateTo');
  const pageSize = root.querySelector('#kardexPageSize');
  const tablePanel = root.querySelector('#kardexTablePanel');
  const state = root.querySelector('#kardexState');
  const filterError = root.querySelector('#kardexFilterError');
  const pageInfo = root.querySelector('#kardexPageInfo');
  const previous = root.querySelector('#kardexPrevious');
  const next = root.querySelector('#kardexNext');
  const pageTotals = {
    entradas: root.querySelector('[data-kardex-total="entradas"]'),
    salidas: root.querySelector('[data-kardex-total="salidas"]'),
  };

  let pagina = 1;
  let totalPaginas = 0;
  let latestRequest = 0;
  let pendingRequest = null;
  let searchTimer;

  function hasActiveFilters() {
    return Boolean(search.value.trim() || modelFilter.value || typeFilter.value || dateFrom.value || dateTo.value);
  }

  function validateDates() {
    const invalid = Boolean(dateFrom.value && dateTo.value && dateFrom.value > dateTo.value);
    filterError.textContent = invalid ? 'La fecha inicial no puede ser posterior a la fecha final.' : '';
    filterError.hidden = !invalid;
    return !invalid;
  }

  function buildQuery() {
    const params = new URLSearchParams();
    const values = {
      nombre_modelo: search.value.trim(),
      id_modelo: modelFilter.value,
      tipo: typeFilter.value,
      fecha_desde: dateFrom.value,
      fecha_hasta: dateTo.value,
      pagina: String(pagina),
      limite: pageSize.value,
    };
    Object.entries(values).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    return params.toString();
  }

  function setLoading() {
    state.hidden = false;
    state.setAttribute('role', 'status');
    state.textContent = 'Cargando movimientos…';
    tablePanel.replaceChildren();
    tablePanel.setAttribute('aria-busy', 'true');
    pageTotals.entradas.textContent = 'Cargando…';
    pageTotals.salidas.textContent = 'Cargando…';
    previous.disabled = true;
    next.disabled = true;
  }

  function setFailure(error) {
    state.hidden = false;
    state.setAttribute('role', 'alert');
    state.textContent = errorMessage(error);
    tablePanel.replaceChildren();
    tablePanel.setAttribute('aria-busy', 'false');
    pageTotals.entradas.textContent = '—';
    pageTotals.salidas.textContent = '—';
    pageInfo.textContent = 'No disponible';
    previous.disabled = true;
    next.disabled = true;
  }

  function renderEmpty() {
    const empty = document.createElement('p');
    empty.className = 'empty-state kardex-empty-state';
    empty.setAttribute('role', 'status');
    empty.textContent = hasActiveFilters()
      ? 'No hay movimientos que coincidan con los filtros seleccionados.'
      : 'Aún no hay movimientos registrados.';
    tablePanel.replaceChildren(empty);
  }

  function updatePagination(pagination) {
    pagina = Number(pagination.pagina);
    totalPaginas = Number(pagination.total_paginas);
    const total = Number(pagination.total_registros);
    pageInfo.textContent = totalPaginas
      ? `Página ${pagina} de ${totalPaginas} · ${formatUnits(total)} registros`
      : `0 páginas · ${formatUnits(total)} registros`;
    previous.disabled = pagina <= 1;
    next.disabled = totalPaginas === 0 || pagina >= totalPaginas;
  }

  function invalidatePendingRequest() {
    latestRequest += 1;
    pendingRequest = null;
  }

  async function loadMovements() {
    if (!root.isConnected) return;
    if (!validateDates()) {
      invalidatePendingRequest();
      state.hidden = false;
      state.setAttribute('role', 'alert');
      state.textContent = 'Corrige el rango de fechas para consultar los movimientos.';
      tablePanel.replaceChildren();
      tablePanel.setAttribute('aria-busy', 'false');
      pageTotals.entradas.textContent = '—';
      pageTotals.salidas.textContent = '—';
      pageInfo.textContent = 'Rango de fechas inválido';
      previous.disabled = true;
      next.disabled = true;
      return;
    }

    const query = buildQuery();
    if (pendingRequest?.query === query) return pendingRequest.promise;
    const requestId = ++latestRequest;
    const isCurrent = () => root.isConnected && requestId === latestRequest;
    setLoading();

    const promise = http(`/api/kardex?${query}`).then((response) => {
      if (!isCurrent()) return;
      if (!response?.success || !Array.isArray(response.data) || !response.resumen || !response.paginacion) {
        throw new Error('El servidor devolvió una respuesta inválida para el Kardex.');
      }
      state.hidden = true;
      state.textContent = '';
      tablePanel.setAttribute('aria-busy', 'false');
      pageTotals.entradas.textContent = formatUnits(response.resumen.total_entradas);
      pageTotals.salidas.textContent = formatUnits(response.resumen.total_salidas);
      updatePagination(response.paginacion);
      if (response.data.length) {
        tablePanel.replaceChildren(createTable(
          ['Fecha y hora', 'Modelo', 'Tipo de movimiento', 'Cantidad', 'Documento de origen', 'Descripción', 'Saldo acumulado'],
          createRows(response.data),
          { className: 'kardex-table' },
        ));
      } else {
        renderEmpty();
      }
    }).catch((error) => {
      if (isCurrent()) setFailure(error);
    }).finally(() => {
      if (pendingRequest?.requestId === requestId) pendingRequest = null;
    });
    pendingRequest = { query, requestId, promise };
    return promise;
  }

  async function loadModels() {
    const modelError = root.querySelector('#kardexModelError');
    modelFilter.disabled = true;
    try {
      const response = await http('/api/kardex/modelos');
      if (!root.isConnected) return;
      if (!response?.success || !Array.isArray(response.data)) {
        throw new Error('El servidor devolvió una respuesta inválida para los modelos del Kardex.');
      }
      const options = response.data.map((model) => {
        const option = document.createElement('option');
        option.value = String(model.id_modelo);
        option.textContent = model.nombre_modelo;
        return option;
      });
      modelFilter.replaceChildren(modelFilter.options[0], ...options);
      modelFilter.disabled = false;
      modelError.hidden = true;
      modelError.textContent = '';
    } catch (error) {
      if (!root.isConnected) return;
      modelFilter.disabled = true;
      modelError.hidden = false;
      modelError.textContent = error.status === 401
        ? 'Tu sesión expiró; inicia sesión nuevamente.'
        : error.status === 403
          ? 'No tienes permiso para consultar los modelos del Kardex.'
          : error.message || 'No se pudieron cargar los modelos del Kardex.';
    }
  }

  function filtersChanged() {
    pagina = 1;
    clearTimeout(searchTimer);
    invalidatePendingRequest();
    void loadMovements();
  }

  search.addEventListener('input', () => {
    pagina = 1;
    clearTimeout(searchTimer);
    invalidatePendingRequest();
    if (!validateDates()) {
      void loadMovements();
      return;
    }
    searchTimer = setTimeout(() => void loadMovements(), 250);
  });
  root.querySelector('#kardexFilters').addEventListener('submit', (event) => {
    event.preventDefault();
    filtersChanged();
  });
  [modelFilter, typeFilter, dateFrom, dateTo].forEach((control) => {
    control.addEventListener('change', filtersChanged);
  });
  pageSize.addEventListener('change', () => {
    pagina = 1;
    invalidatePendingRequest();
    void loadMovements();
  });
  root.querySelector('#kardexClear').addEventListener('click', () => {
    search.value = '';
    modelFilter.value = '';
    typeFilter.value = '';
    dateFrom.value = '';
    dateTo.value = '';
    filtersChanged();
  });
  previous.addEventListener('click', () => {
    if (pagina > 1) {
      pagina -= 1;
      invalidatePendingRequest();
      void loadMovements();
    }
  });
  next.addEventListener('click', () => {
    if (pagina < totalPaginas) {
      pagina += 1;
      invalidatePendingRequest();
      void loadMovements();
    }
  });

  await Promise.all([loadModels(), loadMovements()]);
}
