export function createCell(value, secondary = '') {
  const cell = document.createElement('td');
  if (!secondary) {
    cell.textContent = String(value ?? '—');
    return cell;
  }

  const primary = document.createElement('span');
  primary.className = 'cell-primary';
  primary.textContent = String(value ?? '—');
  const detail = document.createElement('span');
  detail.className = 'cell-secondary';
  detail.textContent = secondary;
  cell.append(primary, detail);
  return cell;
}

export function createStatusCell(value) {
  const cell = document.createElement('td');
  const badge = document.createElement('span');
  const active = Number(value) === 1;
  badge.className = `badge ${active ? 'badge-success' : 'badge-danger'}`;
  badge.textContent = active ? 'Activo' : 'Inactivo';
  cell.append(badge);
  return cell;
}

export function createBadgeCell(label, secondary = '') {
  const cell = document.createElement('td');
  const badge = document.createElement('span');
  badge.className = 'badge badge-info inventory-related-badge';
  badge.textContent = String(label ?? '—');
  cell.append(badge);
  if (secondary) {
    const detail = document.createElement('span');
    detail.className = 'cell-secondary inventory-relation-id';
    detail.textContent = secondary;
    cell.append(detail);
  }
  return cell;
}

export function createNumericCell(value, className = '') {
  const cell = document.createElement('td');
  cell.className = `inventory-number ${className}`.trim();
  cell.textContent = String(value ?? '—');
  return cell;
}

export function createActionButton({ action, id, label, icon, className, dataset = 'category' }) {
  const button = document.createElement('button');
  button.className = `btn-action ${className}`;
  button.type = 'button';
  button.dataset[`${dataset}Action`] = action;
  button.dataset[`${dataset}Id`] = String(id);
  button.setAttribute('aria-label', label);
  button.title = label;
  const glyph = document.createElement('i');
  glyph.className = icon;
  glyph.setAttribute('aria-hidden', 'true');
  button.append(glyph);
  return button;
}

export function createTable(headers, rows, { className = '' } = {}) {
  const wrapper = document.createElement('div');
  wrapper.className = 'table-scroll';
  const table = document.createElement('table');
  table.className = `table-custom inventory-table ${className}`.trim();
  const head = document.createElement('thead');
  const headerRow = document.createElement('tr');
  headers.forEach((label) => {
    const header = document.createElement('th');
    header.scope = 'col';
    header.textContent = label;
    headerRow.append(header);
  });
  head.append(headerRow);
  const body = document.createElement('tbody');
  rows.forEach((cells) => {
    const row = document.createElement('tr');
    row.append(...cells);
    body.append(row);
  });
  table.append(head, body);
  wrapper.append(table);
  return wrapper;
}
