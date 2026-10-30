import { randomUUID, createHash } from 'node:crypto';
import { pool } from '../config/db.js';
import { contratoService } from './contratoService.js';
import { proveedorService } from './proveedorService.js';

const revisiones = new Map();
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const entero = (n) => Number.isInteger(n) && n > 0 && n <= 2147483647;
const huella = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function iniciales(nombre) {
  const limpio = nombre.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return limpio.startsWith('LIDERBOOK') ? 'LIB' : limpio.slice(0, 3) || 'PRV';
}

async function resumenes(conn, ids) {
  const [rows] = await conn.query(`SELECT o.id_orden, o.codigo, o.id_proveedor, o.estado,
    p.razon_social AS proveedor, COALESCE(SUM(d.cantidad_pedida),0) AS total,
    COUNT(DISTINCT d.id_producto) AS modelos
    FROM ordenes_compra o JOIN proveedores p ON p.id_proveedor=o.id_proveedor
    LEFT JOIN orden_detalles d ON d.id_orden=o.id_orden
    WHERE o.id_orden IN (?) GROUP BY o.id_orden, o.codigo, o.id_proveedor, o.estado, p.razon_social
    ORDER BY o.id_orden`, [ids]);
  return rows.map((o) => ({ ...o, total: Number(o.total), modelos: Number(o.modelos) }));
}

// Los nombres, modelos y cantidades originales se verifican en la API, nunca en el navegador.
async function preparar(entrada) {
  if (!Array.isArray(entrada) || !entrada.length || entrada.length > 100) throw fail('Agrega entre 1 y 100 contratos.');
  const proveedores = await proveedorService.listarActivos();
  const ids = new Set();
  const contratos = [];
  const ordenes = new Map();
  for (const solicitud of entrada) {
    if (!solicitud || !entero(solicitud.id_contrato) || ids.has(solicitud.id_contrato)) throw fail('Hay contratos inválidos o duplicados.');
    ids.add(solicitud.id_contrato);
    const contrato = await contratoService.obtenerPorId(String(solicitud.id_contrato));
    if (typeof contrato.colegio !== 'string' || !contrato.colegio.trim()) throw fail(`El contrato ${contrato.id_contrato} no tiene colegio registrado. Corrige el dato en el sistema de contratos.`,409);
    if (!contrato.productos.length || !Array.isArray(solicitud.productos) || solicitud.productos.length !== contrato.productos.length) throw fail('Debes incluir todos los modelos del contrato.');
    const modelos = new Set();
    const productos = contrato.productos.map((original) => {
      if (!entero(original.id_modelo) || modelos.has(original.id_modelo)) throw fail('La API contiene modelos inválidos o repetidos.', 502);
      modelos.add(original.id_modelo);
      const seleccion = solicitud.productos.filter((p) => p?.id_modelo === original.id_modelo);
      if (seleccion.length !== 1) throw fail('La selección de modelos no coincide con la API.');
      const p = seleccion[0];
      const proveedor = proveedores.find((item) => item.id_proveedor === p.id_proveedor);
      if (!proveedor || !entero(p.cantidad) || p.cantidad < original.cantidad) throw fail('Selecciona proveedores activos y cantidades enteras iguales o mayores al contrato.');
      if (!ordenes.has(proveedor.id_proveedor)) ordenes.set(proveedor.id_proveedor, { ...proveedor, productos: [] });
      const orden = ordenes.get(proveedor.id_proveedor);
      let detalle = orden.productos.find((item) => item.id_modelo === original.id_modelo);
      if (!detalle) {
        detalle = { id_modelo: original.id_modelo, modelo: original.modelo, categoria: original.categoria, cantidad: 0, distribuciones: [] };
        orden.productos.push(detalle);
      }
      detalle.cantidad += p.cantidad;
      if (!entero(detalle.cantidad)) throw fail('La cantidad acumulada supera el límite permitido.');
      detalle.distribuciones.push({ id_contrato: contrato.id_contrato, colegio: contrato.colegio, original: original.cantidad, cantidad: p.cantidad });
      return { ...original, cantidad_pedir: p.cantidad, id_proveedor: p.id_proveedor };
    });
    contratos.push({ ...contrato, productos });
  }
  return { contratos, ordenes: [...ordenes.values()] };
}

export const compraMasivaService = {
  async buscarOrdenes(texto = '', pagina = 1) {
    if (typeof texto !== 'string' || texto.length > 200 || !Number.isInteger(pagina) || pagina < 1 || pagina > 1000000) throw fail('Búsqueda de órdenes inválida.');
    const patron = `%${texto.trim().replace(/[=%_]/g, (c) => `=${c}`)}%`;
    const [rows] = await pool.query(`SELECT o.id_orden FROM ordenes_compra o
      JOIN proveedores p ON p.id_proveedor=o.id_proveedor
      WHERE o.codigo LIKE ? ESCAPE '=' OR p.razon_social LIKE ? ESCAPE '='
      ORDER BY o.id_orden DESC LIMIT 21 OFFSET ?`, [patron, patron, (pagina - 1) * 20]);
    const ids = rows.slice(0, 20).map((o) => o.id_orden);
    const ordenes = ids.length ? await resumenes(pool, ids) : [];
    ordenes.sort((a, b) => b.id_orden - a.id_orden);
    return { ordenes, pagina, hayMas: rows.length > 20 };
  },
  async obtenerOrden(id) {
    if (!entero(id)) throw fail('Ingresa un ID de orden válido.');
    const conn = await pool.getConnection();
    try {
      // Una misma vista consistente para cabecera, modelos y distribuciones.
      await conn.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await conn.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
      const [[orden]] = await conn.query(`SELECT o.id_orden, o.codigo,
        DATE_FORMAT(o.fecha_emision, '%d/%m/%Y') AS fecha, o.estado, p.razon_social AS proveedor
        FROM ordenes_compra o JOIN proveedores p ON p.id_proveedor=o.id_proveedor
        WHERE o.id_orden=?`, [id]);
      if (!orden) throw fail('Orden de compra no encontrada.', 404);
      const [productos] = await conn.query(`SELECT od.id_orden_detalle, p.nombre AS modelo,
        p.categoria, od.cantidad_pedida AS cantidad
        FROM orden_detalles od JOIN productos p ON p.id_producto=od.id_producto
        WHERE od.id_orden=? ORDER BY p.categoria, p.nombre, od.id_orden_detalle`, [id]);
      const [distribuciones] = await conn.query(`SELECT cr.id_contrato, cr.id_contrato_api,
        cr.cliente_colegio AS colegio, p.nombre AS modelo, p.categoria,
        SUM(d.cantidad_asignada) AS cantidad
        FROM orden_distribuciones d
        JOIN orden_detalles od ON od.id_orden_detalle=d.id_orden_detalle
        JOIN contrato_detalles cd ON cd.id_detalle_contrato=d.id_detalle_contrato
        JOIN contratos_referencia cr ON cr.id_contrato=cd.id_contrato
        JOIN productos p ON p.id_producto=od.id_producto
        WHERE od.id_orden=?
        GROUP BY cr.id_contrato, cr.id_contrato_api, cr.cliente_colegio, p.id_producto, p.nombre, p.categoria
        ORDER BY cr.cliente_colegio, cr.id_contrato, p.categoria, p.nombre`, [id]);
      await conn.commit();
      return { ...orden, modelos: productos.length, productos, distribuciones: distribuciones.map((d) => ({ ...d, cantidad: Number(d.cantidad) })),
        total: productos.reduce((sum, p) => sum + p.cantidad, 0) };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally { conn.release(); }
  },

  async revisar(contratos) {
    for (const [key, value] of revisiones) if (value.vence < Date.now()) revisiones.delete(key);
    if (revisiones.size >= 500) throw fail('Hay demasiadas revisiones pendientes. Intenta más tarde.', 503);
    const plan = await preparar(contratos);
    const token = randomUUID();
    revisiones.set(token, { entrada: structuredClone(contratos), plan, vence: Date.now() + 30 * 60 * 1000 });
    return { token, ordenes: plan.ordenes };
  },

  async confirmar(token) {
    if (typeof token !== 'string' || !/^[a-f0-9-]{36}$/.test(token)) throw fail('Revisión inválida.');
    const marker = `Compra masiva ${token}`;
    const conn = await pool.getConnection();
    let locked = false;
    try {
      // Serializa este flujo incluso con dos procesos Node: protege referencias y reintentos.
      const [[lock]] = await conn.query("SELECT GET_LOCK('ishume_compra_masiva', 15) AS adquirido");
      if (lock.adquirido !== 1) throw fail('Hay otra compra en proceso. Intenta nuevamente.', 409);
      locked = true;
      const [existentes] = await conn.query('SELECT id_orden, codigo, id_proveedor FROM ordenes_compra WHERE observaciones = ? ORDER BY id_orden', [marker]);
      if (existentes.length) return { ordenes: await resumenes(conn, existentes.map((o) => o.id_orden)), repetida: true };
      const revision = revisiones.get(token);
      if (!revision || revision.vence < Date.now()) throw fail('La revisión venció o el servidor se reinició. Prepara las órdenes nuevamente.', 409);
      const actual = await preparar(revision.entrada);
      if (huella(actual) !== huella(revision.plan)) throw fail('Los contratos o proveedores cambiaron. Revisa las órdenes nuevamente.', 409);
      await conn.beginTransaction();
      const proveedoresIds = actual.ordenes.map((o) => o.id_proveedor);
      const [activos] = await conn.query("SELECT id_proveedor FROM proveedores WHERE id_proveedor IN (?) AND estado = 'Activo' FOR UPDATE", [proveedoresIds]);
      if (activos.length !== proveedoresIds.length) throw fail('Un proveedor dejó de estar activo. Revisa la compra.', 409);
      const referencias = new Map();
      const productosLocales = new Map();
      for (const contrato of actual.contratos) {
        await conn.query(`INSERT INTO contratos_referencia (id_contrato_api, origen, cliente_colegio, fecha_entrega)
          VALUES (?, 'API', ?, ?) ON DUPLICATE KEY UPDATE id_contrato=LAST_INSERT_ID(id_contrato)`,
        [contrato.id_contrato, contrato.colegio, contrato.fecha_entrega || null]);
        const [[referencia]] = await conn.query('SELECT id_contrato FROM contratos_referencia WHERE id_contrato_api=?', [contrato.id_contrato]);
        for (const p of contrato.productos) {
          await conn.query(`INSERT INTO productos (id_modelo_api, nombre, tipo, categoria, nivel_educativo)
            VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE nombre=VALUES(nombre), tipo=VALUES(tipo), categoria=VALUES(categoria), nivel_educativo=VALUES(nivel_educativo)`,
          [p.id_modelo, p.modelo, p.tipo ?? null, p.categoria ?? null, p.nivel ?? null]);
          const [[producto]] = await conn.query('SELECT id_producto FROM productos WHERE id_modelo_api=?', [p.id_modelo]);
          productosLocales.set(p.id_modelo, producto.id_producto);
          // Una nueva versión si cambió la cantidad: conserva las referencias históricas ya compradas.
          const [detalles] = await conn.query('SELECT id_detalle_contrato FROM contrato_detalles WHERE id_contrato=? AND id_producto=? AND cantidad_requerida=? ORDER BY id_detalle_contrato LIMIT 1',
            [referencia.id_contrato, producto.id_producto, p.cantidad]);
          let detalleId = detalles[0]?.id_detalle_contrato;
          if (!detalleId) {
            const [insert] = await conn.query('INSERT INTO contrato_detalles (id_contrato,id_producto,cantidad_requerida) VALUES (?,?,?)', [referencia.id_contrato, producto.id_producto, p.cantidad]);
            detalleId = insert.insertId;
          }
          referencias.set(`${contrato.id_contrato}:${p.id_modelo}`, detalleId);
        }
      }
      const generadas = [];
      for (const orden of actual.ordenes) {
        // El bloqueo ishume_compra_masiva y la fila del proveedor ya están adquiridos.
        // La secuencia visible pertenece al proveedor, independientemente del PK global.
        // Se conservan los sufijos de prefijos anteriores si cambia su razón social.
        const [[ultimo]] = await conn.query(`SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(codigo,'-',-1) AS UNSIGNED)),0) AS numero
          FROM ordenes_compra WHERE id_proveedor=? AND codigo REGEXP '^OC-[A-Z0-9]+-[0-9]+$'
          AND codigo NOT LIKE 'OC-MAS-%'`, [orden.id_proveedor]);
        const secuencia = Number(ultimo.numero) + 1;
        if (!Number.isSafeInteger(secuencia) || secuencia < 1) throw fail('La numeración del proveedor supera el límite permitido.',409);
        const codigo = `OC-${iniciales(orden.razon_social)}-${String(secuencia).padStart(4, '0')}`;
        if (codigo.length > 30) throw fail('El código del pedido supera el límite permitido.',409);
        const [ocupadas] = await conn.query('SELECT id_orden FROM ordenes_compra WHERE codigo=?', [codigo]);
        if (ocupadas.length) throw fail('El código del proveedor coincide con otro pedido. Revisa los prefijos antes de guardar.',409);
        const [insert] = await conn.query(`INSERT INTO ordenes_compra (codigo,id_proveedor,fecha_emision,estado,observaciones) VALUES (?,?,DATE(CONVERT_TZ(UTC_TIMESTAMP(),'+00:00','-05:00')),'Borrador',?)`, [codigo, orden.id_proveedor, marker]);
        for (const p of orden.productos) {
          const [linea] = await conn.query('INSERT INTO orden_detalles (id_orden,id_producto,cantidad_pedida) VALUES (?,?,?)', [insert.insertId, productosLocales.get(p.id_modelo), p.cantidad]);
          for (const d of p.distribuciones) await conn.query('INSERT INTO orden_distribuciones (id_orden_detalle,id_detalle_contrato,cantidad_asignada) VALUES (?,?,?)', [linea.insertId, referencias.get(`${d.id_contrato}:${p.id_modelo}`), d.cantidad]);
        }
        generadas.push({ id_orden: insert.insertId, codigo, id_proveedor: orden.id_proveedor });
      }
      const ordenes = await resumenes(conn, generadas.map((o) => o.id_orden));
      await conn.commit();
      revisiones.delete(token);
      return { ordenes, repetida: false };
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      try {
        if (locked) await conn.query("SELECT RELEASE_LOCK('ishume_compra_masiva')");
      } finally {
        conn.release();
      }
    }
  },
};
