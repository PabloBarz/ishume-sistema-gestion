# Demostracion temporal de seguimiento en Inventario

Ruta SPA aislada: `#/inventario/demo-seguimiento`.
El camion de Ordenes generadas enlaza a `#/inventario/demo-seguimiento?orden=<id_solicitud>`.
No abre un modal. Inventario en el sidebar enlaza a la misma ruta sin ID y ofrece
un selector paginado de ordenes masivas. El retorno utiliza
`#/ordenes/guardadas?vista=generadas`.

La vista `public/views/seguimiento_entrega_demo.html` y el modulo
`public/js/modules/seguimientoEntregaDemo.js` son temporales. Consultan los endpoints
existentes de solicitudes y su detalle. Codigo, proveedor, colegios, modelos y
cantidades solicitadas son reales; recepcion, pendientes derivados y estado son
simulados en memoria y se reinician al navegar. No hay escrituras, tablas,
endpoints ni movimientos de inventario adicionales.

## Relaciones que debe respetar la integracion real

`solicitudes_cotizacion.id_solicitud` identifica la orden masiva.
`solicitud_ordenes` recupera los `ordenes_compra.id_orden` asociados.
`orden_detalles` contiene productos y cantidades, y `orden_distribuciones`
conserva su distribucion por contrato.
Actualmente `recepciones.id_orden` referencia la orden interna, no la masiva.
No asociar recepciones solamente por proveedor.

Al integrar la rama, acordar la ruta SPA real y una consulta por `id_solicitud`
que devuelva lineas identificadas por orden interna, detalle y contrato, con
cantidades solicitadas, recibidas y pendientes. Evitar duplicar cantidades por
uniones entre distribuciones y recepciones. Conformidad e incidencias deben
provenir de inspecciones reales; no se deducen del pago ni de haber recibido.

Sustituir la ruta de demostracion, su selector y simulacion por el modulo real,
y actualizar los enlaces de Inventario y del camion. Retirar las notas de
simulacion solamente cuando se muestren recepciones reales.
Las ediciones de Pagos siguen suspendidas mediante `src/config/pagosConfig.js`.

Actualizacion de la demostracion: Recibido se introduce manualmente por linea de distribucion, identificada por su indice en el detalle de esa orden; no se agrupa por nombre de modelo. Pedido es de solo lectura. Falta y estado se calculan automaticamente. No se muestra boton de reinicio; los recibidos se restablecen al volver a cargar la vista. No hay selector de escenarios ni seccion de inspeccion en esta pantalla. Al integrar Recepcion, sustituir estos valores en memoria por las lineas persistidas reales y sus identificadores.

Presentacion actual: Resumen de entrega y Productos de la orden, con columnas Colegio, Modelo, Pedido, Recibido y Falta. No se muestran etiquetas de demostracion en esta pantalla; el funcionamiento permanece temporal y exclusivamente en memoria, sin persistencia de recepciones.

Criterio global actualizado: el seguimiento general muestra productos consolidados por ID, sin colegios visibles. Recibido se introduce por modelo consolidado, limitado al total pedido de ese modelo. La distribucion original por contrato se conserva para recepcion y despacho operativos. Ver CONSOLIDACION-PRODUCTOS.md.
