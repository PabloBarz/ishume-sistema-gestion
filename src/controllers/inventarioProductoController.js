import { inventarioProductoService } from '../services/inventarioProductoService.js';

function idValido(value) {
  return typeof value === 'string' && /^\d+$/.test(value) &&
    Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

function enteroPositivo(value) {
  if (typeof value === 'string') {
    return /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0;
  }
  return Number.isSafeInteger(value) && value > 0;
}

function skuNormalizado(value) {
  if (typeof value !== 'string') return null;
  const sku = value.trim();
  return sku.length > 0 && Array.from(sku).length <= 30 ? sku : null;
}

function precioNormalizado(value, usarDefecto = false) {
  if (value === undefined && usarDefecto) return '0.00';
  const texto = typeof value === 'number' && Number.isFinite(value)
    ? String(value)
    : typeof value === 'string' ? value.trim() : '';
  if (!/^\d+(?:\.\d{1,2})?$/.test(texto)) return null;
  const precio = Number(texto);
  if (!Number.isFinite(precio) || precio < 0 || precio > 999.99) return null;
  return precio.toFixed(2);
}

function cuerpoValido(body) {
  return body && typeof body === 'object' && !Array.isArray(body);
}

function incluyeStock(body) {
  return Object.hasOwn(body, 'stock_actual');
}

function responderError(res, error, operacion) {
  if (error.status) {
    return res.status(error.status).json({ success: false, message: error.message });
  }

  console.error(error);
  return res.status(500).json({
    success: false,
    message: `Error al ${operacion} el producto.`,
  });
}

export const inventarioProductoController = {
  async listar(req, res) {
    const { id_categoria: idCategoria, id_diseno: idDiseno, id_modelo: idModelo, estado } = req.query;
    for (const [valor, etiqueta] of [
      [idCategoria, 'categoría'],
      [idDiseno, 'diseño'],
      [idModelo, 'modelo'],
    ]) {
      if (valor !== undefined && !enteroPositivo(valor)) {
        return res.status(400).json({ success: false, message: `El identificador de ${etiqueta} debe ser un entero mayor que cero.` });
      }
    }
    if (estado !== undefined && estado !== '0' && estado !== '1') {
      return res.status(400).json({ success: false, message: 'El estado debe ser 0 o 1.' });
    }

    try {
      const productos = await inventarioProductoService.obtenerTodos({
        idCategoria: idCategoria === undefined ? null : Number(idCategoria),
        idDiseno: idDiseno === undefined ? null : Number(idDiseno),
        idModelo: idModelo === undefined ? null : Number(idModelo),
        estado: estado === undefined ? null : Number(estado),
      });
      return res.status(200).json({ success: true, data: productos });
    } catch (error) {
      return responderError(res, error, 'listar');
    }
  },

  async obtener(req, res) {
    const { id } = req.params;
    if (!idValido(id)) {
      return res.status(400).json({ success: false, message: 'El identificador debe ser un entero mayor que cero.' });
    }

    try {
      const producto = await inventarioProductoService.obtenerPorId(Number(id));
      return res.status(200).json({ success: true, data: producto });
    } catch (error) {
      return responderError(res, error, 'obtener');
    }
  },

  async crear(req, res) {
    if (!cuerpoValido(req.body)) {
      return res.status(400).json({ success: false, message: 'El cuerpo de la solicitud debe ser un objeto JSON.' });
    }
    if (incluyeStock(req.body)) {
      return res.status(400).json({ success: false, message: 'El stock no se puede establecer al crear un producto.' });
    }
    const { id_modelo: idModelo, sku: skuRecibido, precio } = req.body;
    const sku = skuNormalizado(skuRecibido);
    const precioValor = precioNormalizado(precio, true);
    if (!enteroPositivo(idModelo)) {
      return res.status(400).json({ success: false, message: 'El identificador de modelo debe ser un entero mayor que cero.' });
    }
    if (!sku) {
      return res.status(400).json({ success: false, message: 'El SKU es obligatorio y debe tener como máximo 30 caracteres.' });
    }
    if (precioValor === null) {
      return res.status(400).json({ success: false, message: 'El precio debe ser un importe válido entre 0 y 999.99, con hasta dos decimales.' });
    }

    try {
      const producto = await inventarioProductoService.crear({
        idModelo: Number(idModelo),
        sku,
        precio: precioValor,
      });
      return res.status(201).json({ success: true, message: 'Producto creado correctamente.', data: producto });
    } catch (error) {
      return responderError(res, error, 'crear');
    }
  },

  async actualizar(req, res) {
    const { id } = req.params;
    if (!idValido(id)) {
      return res.status(400).json({ success: false, message: 'El identificador debe ser un entero mayor que cero.' });
    }
    if (!cuerpoValido(req.body)) {
      return res.status(400).json({ success: false, message: 'El cuerpo de la solicitud debe ser un objeto JSON.' });
    }
    if (incluyeStock(req.body)) {
      return res.status(400).json({ success: false, message: 'El stock no se puede modificar mediante el CRUD de productos.' });
    }
    const { id_modelo: idModelo, sku: skuRecibido, precio } = req.body;
    const sku = skuNormalizado(skuRecibido);
    const precioValor = precioNormalizado(precio);
    if (!enteroPositivo(idModelo)) {
      return res.status(400).json({ success: false, message: 'El identificador de modelo debe ser un entero mayor que cero.' });
    }
    if (!sku) {
      return res.status(400).json({ success: false, message: 'El SKU es obligatorio y debe tener como máximo 30 caracteres.' });
    }
    if (precioValor === null) {
      return res.status(400).json({ success: false, message: 'El precio debe ser un importe válido entre 0 y 999.99, con hasta dos decimales.' });
    }

    try {
      const producto = await inventarioProductoService.actualizar(Number(id), {
        idModelo: Number(idModelo),
        sku,
        precio: precioValor,
      });
      return res.status(200).json({ success: true, message: 'Producto actualizado correctamente.', data: producto });
    } catch (error) {
      return responderError(res, error, 'actualizar');
    }
  },

  async cambiarEstado(req, res) {
    const { id } = req.params;
    const { estado } = req.body ?? {};
    if (!idValido(id)) {
      return res.status(400).json({ success: false, message: 'El identificador debe ser un entero mayor que cero.' });
    }
    if (estado !== 0 && estado !== 1) {
      return res.status(400).json({ success: false, message: 'El estado debe ser 0 o 1.' });
    }

    try {
      const producto = await inventarioProductoService.cambiarEstado(Number(id), estado);
      return res.status(200).json({
        success: true,
        message: estado === 1 ? 'Producto activado correctamente.' : 'Producto desactivado correctamente.',
        data: producto,
      });
    } catch (error) {
      return responderError(res, error, estado === 1 ? 'activar' : 'desactivar');
    }
  },
};
