# Reglas del inventario

## Existencias y Kardex

El CRUD de `inventario_productos` crea productos con `stock_actual = 0` y no permite modificar directamente las existencias en `POST` ni `PUT`. El stock se consulta desde la ficha, pero sus cambios deben realizarse únicamente mediante operaciones de inventario.

En las siguientes etapas, cada cambio de existencias deberá registrar su movimiento en Kardex dentro de la misma transacción MySQL:

- Entrada manual: aumenta el stock.
- Salida manual: disminuye el stock.
- Recepción conforme y reposición conforme: aumentan el stock.
- Avance de preparación: no modifica el stock.
- Confirmación del despacho completo: disminuye el stock.
- Ajuste de inventario: aumenta o disminuye según el motivo.

No debe existir una actualización directa del stock sin su correspondiente movimiento de Kardex.

## Estado de productos y operaciones pendientes

La desactivación actual solo se bloquea cuando `stock_actual` es mayor que cero. No se bloquea por referencias históricas en contratos, órdenes, recepciones, despachos o Kardex.

La validación de operaciones abiertas queda pendiente hasta que se definan los estados finales de contratos, órdenes de compra, recepciones y despachos. No se deben inferir transiciones a partir de los valores por defecto del esquema.
