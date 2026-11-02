# Consultar colegios

Ruta SPA: `#/compras/colegios`. GET `/api/colegios-compras?q=...` busca nombres
guardados en `contratos_referencia`; GET `/api/colegios-compras/:id` consulta el
contrato local seleccionado. Ahora combina las referencias locales con el listado
`escolares_en_proceso` de la API, sin cambiar sus filtros globales. La identidad
de unión es el ID del contrato de origen, nunca una similitud de nombres.
Los resultados sin referencia local usan `api-ID`; al consultarlos se verifica
primero si ya existe una referencia local y, si no, se muestra el colegio sin
compras, con total cero. Nunca se usan cantidades contratadas como compras.
Si la API falla, se mantienen los resultados locales y se informa la limitación.

La busqueda es parcial, insensible a mayusculas y tildes, con parametros SQL y
comodines escapados. Muestra hasta 20 coincidencias y pide precisar si hay mas.
Se muestra el numero del contrato para distinguir nombres coincidentes.

## Origen de las cantidades

`contratos_referencia -> contrato_detalles -> orden_distribuciones -> orden_detalles
-> ordenes_compra -> proveedores`.

Cada distribucion se lee una sola vez. Se usa `cantidad_asignada`, nunca
`cantidad_requerida` ni las cantidades de la API. Un LEFT JOIN con
`solicitud_ordenes` (UNIQUE por id_orden) y `solicitudes_cotizacion` determina
Pendiente o Generada y el codigo que se presenta. No se suman instantaneas JSON
de ordenes masivas a los pedidos internos. Se excluyen compras canceladas.

Se agrupa por contrato, ID de producto, proveedor y orden masiva; si no existe
orden masiva, por el pedido interno. La respuesta conserva los IDs de pedidos,
distribuciones y detalles de contrato de cada fila. IDs de producto diferentes
no se fusionan aunque compartan nombre. El detalle se obtiene con una
transaccion de lectura consistente. No hay endpoints de escritura.

## Limite de identidad existente

La base no tiene una entidad independiente de colegio: almacena un nombre en
cada referencia de contrato. Por eso se selecciona una referencia concreta,
sin asumir que dos contratos con nombres parecidos pertenecen al mismo colegio.
Si se requiere una consulta unica entre distintos contratos del mismo colegio,
se necesitara una identidad estable de colegio acordada con el sistema origen;
no se crea ni se infiere en esta funcionalidad.

Si existe una referencia sin pedidos se presenta el estado vacío. Los colegios
actuales de la API también aparecen aunque nunca se guardaran en ISHUME.
Los históricos locales permanecen disponibles; históricos nunca persistidos y
fuera del listado en proceso requieren una fuente adicional del sistema origen.

Los códigos enlazan a la ruta existente de órdenes guardadas con `vista`,
`localizar` (ID real) y `codigo` (filtro inicial). Se abre la pestaña correspondiente
y se resalta la fila, sin abrir PDF ni ejecutar operaciones de guardado.

Comprobación de lectura de los datos actuales: FE Y ALEGRIA SECUNDARIA 5to c
tiene 25 unidades (10 LALO, 15 Joselito); COLEGIO JHON F KENNEDY tiene 21
pendientes. Existen operaciones repetidas anteriores en Santo Domingo Savio y
Paracas Inicial: no se eliminan ni fusionan automáticamente.
