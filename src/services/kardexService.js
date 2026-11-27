import { pool } from '../config/db.js';

function crearFiltros({ nombreModelo, idModelo, tipo, fechaDesde, fechaHasta, referencia }, { incluirTipo = true } = {}) {
  const conditions = [];
  const params = [];

  if (nombreModelo) {
    conditions.push('m.nombre_modelo LIKE ?');
    params.push(`%${nombreModelo}%`);
  }
  if (idModelo !== null) {
    conditions.push('ms.id_modelo = ?');
    params.push(idModelo);
  }
  if (incluirTipo && tipo !== null) {
    conditions.push('ms.tipo = ?');
    params.push(tipo);
  }
  if (fechaDesde !== null) {
    conditions.push('ms.fecha_movimiento >= ?');
    params.push(fechaDesde);
  }
  if (fechaHasta !== null) {
    conditions.push('ms.fecha_movimiento < DATE_ADD(?, INTERVAL 1 DAY)');
    params.push(fechaHasta);
  }
  if (referencia) {
    conditions.push('(ms.codigo_lote LIKE ? OR ms.codigo_despacho LIKE ?)');
    params.push(`%${referencia}%`, `%${referencia}%`);
  }

  return { sql: conditions.length ? `WHERE ${conditions.join(' AND ')}` : '', params };
}

const MOVEMENTS_WITH_MODEL = `
  WITH movimientos_modelo AS (
    SELECT mi.id_movimiento, COALESCE(od.id_modelo, cd.id_modelo) AS id_modelo,
      mi.tipo, mi.cantidad, mi.fecha_movimiento,
      mi.id_recepcion_detalle, mi.id_despacho_detalle, mi.descripcion,
      r.codigo_lote, d.codigo AS codigo_despacho,
      CASE WHEN mi.id_recepcion_detalle IS NOT NULL THEN 'Recepcion' ELSE 'Despacho' END AS tipo_origen,
      COALESCE(r.codigo_lote, d.codigo) AS documento_origen
    FROM movimientos_inventario mi
    LEFT JOIN recepcion_detalles rd ON rd.id_recepcion_detalle = mi.id_recepcion_detalle
    LEFT JOIN orden_detalles od ON od.id_orden_detalle = rd.id_orden_detalle
    LEFT JOIN recepciones r ON r.id_recepcion = rd.id_recepcion
    LEFT JOIN despacho_detalles dd ON dd.id_despacho_detalle = mi.id_despacho_detalle
    LEFT JOIN contrato_detalles cd ON cd.id_detalle_contrato = dd.id_detalle_contrato
    LEFT JOIN despachos d ON d.id_despacho = dd.id_despacho
  )`;

const MOVEMENTS_WITH_BALANCE = `${MOVEMENTS_WITH_MODEL}, movimientos_saldo AS (
    SELECT mm.*,
      SUM(CASE WHEN mm.tipo = 'Entrada' THEN CAST(mm.cantidad AS SIGNED)
        ELSE -CAST(mm.cantidad AS SIGNED) END)
        OVER (PARTITION BY mm.id_modelo
          ORDER BY mm.fecha_movimiento ASC, mm.id_movimiento ASC
          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS saldo_modelo
    FROM movimientos_modelo mm
  )`;

export const kardexService = {
  async listarModelos() {
    const [rows] = await pool.execute(
      `${MOVEMENTS_WITH_MODEL}
       SELECT DISTINCT ms.id_modelo, m.nombre_modelo
       FROM movimientos_modelo ms
       INNER JOIN modelos m ON m.id_modelo = ms.id_modelo
       ORDER BY m.nombre_modelo ASC, ms.id_modelo ASC`,
      [],
    );

    return rows.map((row) => ({
      id_modelo: Number(row.id_modelo),
      nombre_modelo: row.nombre_modelo,
    }));
  },

  async listar({ nombreModelo, idModelo, tipo, fechaDesde, fechaHasta, referencia, pagina, limite }) {
    const offset = (pagina - 1) * limite;
    const criteria = { nombreModelo, idModelo, tipo, fechaDesde, fechaHasta, referencia };
    const filters = crearFiltros(criteria);
    const summaryFilters = crearFiltros(criteria, { incluirTipo: false });
    const [aggregateRows] = await pool.execute(
      `${MOVEMENTS_WITH_MODEL}
       SELECT COUNT(CASE WHEN ? IS NULL OR ms.tipo = ? THEN 1 END) AS total,
         COALESCE(SUM(CASE WHEN ms.tipo = 'Entrada' THEN ms.cantidad ELSE 0 END), 0) AS total_entradas,
         COALESCE(SUM(CASE WHEN ms.tipo = 'Salida' THEN ms.cantidad ELSE 0 END), 0) AS total_salidas
       FROM movimientos_modelo ms
       INNER JOIN modelos m ON m.id_modelo = ms.id_modelo
       ${summaryFilters.sql}`,
      [tipo, tipo, ...summaryFilters.params],
    );
    const aggregate = aggregateRows[0];
    const total = Number(aggregate.total);

    const [rows] = await pool.execute(
      `${MOVEMENTS_WITH_BALANCE}
       SELECT ms.id_movimiento, ms.fecha_movimiento, ms.id_modelo, m.nombre_modelo,
         ms.tipo, ms.cantidad, ms.descripcion,
         ms.tipo_origen, ms.documento_origen,
         ms.saldo_modelo
       FROM movimientos_saldo ms
       INNER JOIN modelos m ON m.id_modelo = ms.id_modelo
       ${filters.sql}
       ORDER BY ms.fecha_movimiento DESC, ms.id_movimiento DESC
       LIMIT ? OFFSET ?`,
      [...filters.params, limite, offset],
    );

    return {
      data: rows.map((row) => ({ ...row,
        id_movimiento: Number(row.id_movimiento),
        id_modelo: Number(row.id_modelo),
        cantidad: Number(row.cantidad),
        saldo_modelo: Number(row.saldo_modelo),
      })),
      resumen: {
        total_entradas: Number(aggregate.total_entradas),
        total_salidas: Number(aggregate.total_salidas),
      },
      paginacion: {
        pagina,
        limite,
        total_registros: total,
        total_paginas: Math.ceil(total / limite),
      },
    };
  },
};
