# Presentacion consolidada de compras

Preparacion y revision inicial de pedidos: conservar colegios, contratos,
cantidades originales y proveedores. No cambia su registro.

Consultas de pedidos ya guardados, revision de consolidacion de pedidos internos,
ordenes generadas, PDF y seguimiento general: usar
`public/js/shared/consolidacionProductos.js` con un unico pedido/orden y proveedor.
La tabla visible contiene productos acumulados por identidad real, sin destinos.

Se usa `id_producto`; para entradas de modelo externo se admite `id_modelo`
o `id_modelo_api` en un espacio de identificadores separado. Nunca se infiere un
identificador mediante el nombre. IDs distintos permanecen separados aunque el
nombre coincida. Las caracteristicas contradictorias de un mismo ID generan error.

Los productos y distribuciones se suman por separado y deben coincidir por ID y
con el total de la orden. Un detalle sin identidad o con cantidades inconsistentes
se rechaza con un mensaje, en lugar de adivinar o ocultar diferencias.

La funcion solo crea copias para presentacion. No actualiza MySQL, instantaneas,
contratos, `solicitud_ordenes` ni `orden_distribuciones`. Estas relaciones siguen
disponibles para preparar cajas, distribuir por colegio y despachar.

El seguimiento recibe los mismos modelos consolidados, y sus cantidades
recibidas temporales se mantienen solo en memoria. La futura integracion real
debera distinguir el seguimiento general de la distribucion operativa por destino.
