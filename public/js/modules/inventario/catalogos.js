import { formatCurrencyPEN, formatNumber } from '../../utils.js';
import { createBadgeCell, createCell, createNumericCell, createStatusCell, createTable } from '../../components/inventoryTable.js';

const catalogTables = {
  productos: {
    headers: ['SKU', 'Modelo', 'Categoría', 'Diseño', 'Nivel educativo', 'Precio', 'Stock', 'Estado', 'Acciones'],
    cells: (record) => [
      createNumericCell(record.sku, 'inventory-sku'),
      createCell(record.nombre_modelo, `Modelo #${record.id_modelo ?? '—'}`),
      createBadgeCell(record.nombre_categoria, `Categoría #${record.id_categoria ?? '—'}`),
      createCell(record.nombre_diseno, `Diseño #${record.id_diseno ?? '—'}`),
      createCell(record.nivel_educativo),
      createNumericCell(formatCurrencyPEN(record.precio), 'inventory-price'),
      createNumericCell(formatNumber(record.stock_actual), 'inventory-stock'),
      createStatusCell(record.estado),
      createCell('—'),
    ],
  },
  disenios: {
    headers: ['ID', 'Diseño', 'Categoría', 'Estado', 'Acciones'],
    cells: (record) => [
      createCell(record.id_diseno),
      createCell(record.nombre_diseno),
      createBadgeCell(record.nombre_categoria, `Categoría #${record.id_categoria ?? '—'}`),
      createStatusCell(record.estado),
      createCell('—'),
    ],
  },
  modelos: {
    headers: ['ID', 'Modelo', 'Nivel educativo', 'Diseño', 'Categoría', 'Estado', 'Acciones'],
    cells: (record) => [
      createCell(record.id_modelo),
      createCell(record.nombre_modelo),
      createCell(record.nivel_educativo),
      createCell(record.nombre_diseno, `Diseño #${record.id_diseno ?? '—'}`),
      createBadgeCell(record.nombre_categoria, `Categoría #${record.id_categoria ?? '—'}`),
      createStatusCell(record.estado),
      createCell('—'),
    ],
  },
};

export function renderReadonlyCatalog(catalog, records) {
  const definition = catalogTables[catalog];
  if (!definition) throw new Error(`No existe una tabla de solo lectura para ${catalog}.`);
  return createTable(definition.headers, records.map(definition.cells));
}
