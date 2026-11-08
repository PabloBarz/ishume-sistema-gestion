// Presenta los datos ficticios propios del dashboard de ISHUME.
const sampleStats = [
  { icon: 'bi bi-cart-plus', color: '#f59e0b', value: '08', label: 'Solicitudes de ejemplo' },
  { icon: 'bi bi-boxes', color: '#6366f1', value: '24', label: 'Artículos de ejemplo' },
  { icon: 'bi bi-receipt', color: '#10b981', value: '03', label: 'Pagos de ejemplo' },
  { icon: 'bi bi-people', color: '#ec4899', value: '04', label: 'Áreas de ejemplo' },
];

const sampleRows = [
  { code: 'DEMO-001', title: 'Solicitud de muestra', detail: 'Compra · ejemplo', status: 'Pendiente', badge: 'warning' },
  { code: 'DEMO-002', title: 'Material de muestra', detail: 'Inventario · ejemplo', status: 'Registrado', badge: 'success' },
  { code: 'DEMO-003', title: 'Pago de muestra', detail: 'Pagos · ejemplo', status: 'Programado', badge: 'info' },
];

const sampleDistribution = [
  { label: 'Compras', value: 45 },
  { label: 'Inventario', value: 75 },
  { label: 'Pagos', value: 30 },
];

// Renderiza los indicadores de muestra con las clases visuales compartidas.
function renderStats(container) {
  container.innerHTML = sampleStats.map((stat) => `
    <article class="stat-card">
      <span class="stat-icon" style="--c:${stat.color}" aria-hidden="true"><i class="${stat.icon}"></i></span>
      <strong class="stat-value">${stat.value}</strong>
      <span class="stat-label">${stat.label}</span>
    </article>`).join('');
}

function renderTable(container) {
  container.innerHTML = `
    <table class="table-custom recent-table">
      <thead><tr><th scope="col">Referencia</th><th scope="col">Concepto</th><th scope="col">Estado</th></tr></thead>
      <tbody>${sampleRows.map((row) => `
        <tr>
          <td class="cell-code">${row.code}</td>
          <td><span class="cell-primary">${row.title}</span><span class="cell-secondary">${row.detail}</span></td>
          <td><span class="badge badge-${row.badge}">${row.status}</span></td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

function renderDistribution(container) {
  container.innerHTML = sampleDistribution.map((item) => `
    <div class="chart-bar-item">
      <div class="chart-bar-label"><span>${item.label}</span><span>${item.value}%</span></div>
      <div class="chart-bar-track"><div class="chart-bar-fill" style="width:${item.value}%"></div></div>
    </div>`).join('');
}

// Inicializa el contenido de ejemplo después de insertar la vista.
export function init() {
  const stats = document.getElementById('dashboardStats');
  const table = document.getElementById('dashboardTable');
  const distribution = document.getElementById('dashboardDistribution');

  if (!stats || !table || !distribution) {
    throw new Error('Faltan contenedores requeridos en la vista dashboard.');
  }

  renderStats(stats);
  renderTable(table);
  renderDistribution(distribution);
}
