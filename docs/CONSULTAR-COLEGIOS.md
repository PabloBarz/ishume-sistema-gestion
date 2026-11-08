# Consultar colegios

## Navegación entre consulta y preparación

`#/compras/colegios?contrato=ID_API` consulta automáticamente el contrato de
origen mediante la ruta existente `api-ID_API`. Cada tarjeta en preparación
incluye «Ver colegio» con ese ID, sin comparar nombres.

La consulta reutiliza `/api/contratos?id=ID_API` para comprobar el bloqueo
persistente y la disponibilidad del contrato. «Preparar pedido» aparece solo
si hay unidades pendientes, el contrato sigue en proceso, tiene modelos
disponibles y no tiene pedidos registrados. Un contrato bloqueado con faltantes
muestra la limitación; no se habilitan pedidos complementarios.

`#/ordenes/nueva?contrato=ID_API` usa la misma carga y validaciones del buscador.
No guarda nada al navegar. La confirmación conserva sus comprobaciones de
duplicados, transacción e idempotencia del backend.

Los colegios, cantidades y proveedores en preparación se conservan en un Map
del módulo JavaScript durante la sesión de esta pestaña. Al volver se reconstruye
el formulario, comprobando los proveedores activos. No se guardan en MySQL ni
localStorage. Recargar o cerrar la pestaña pierde el borrador; un guardado
exitoso limpia el Map. Las revisiones se preparan nuevamente al regresar.
Cada consulta vuelve a leer los pedidos actuales; no se reutiliza un detalle
anterior que pueda quedar desactualizado tras guardar o consolidar.

## Diagnóstico: 22230 Inicial

Comprobado el 2 de noviembre de 2026 mediante consultas de solo lectura:

- El buscador identifica «22230 Inicial» como contrato API 94.
- `contrato.php?id=94` devuelve `productos: []`; Node `/api/colegios-compras/api-94`
  también devuelve cero modelos. No se descartan productos durante la transformación.
- En el sistema PHP, `contrato_modelo WHERE id_contrato=94` no contiene filas,
  incluso usando LEFT JOIN con modelo (no son modelos ocultos por un INNER JOIN).
- `snapshot_contrato` no tiene columnas de modelos. Las tres entradas de
  `historial_contrato` para 94 son cambios de nombre de cliente y colegio.
- «I.E colegio 22230 Nivel inicial» es otro contrato, API 29: tiene siete modelos
  en contrato_modelo y en el detalle PHP. Node conserva los siete sin compras.

No se deben copiar modelos entre ambos contratos ni reconstruir cantidades por
semejanza del nombre. Para 94 se necesitan las asignaciones reales en el sistema
origen, mediante su flujo normal de edición del contrato. Si esos modelos
pertenecen a otra fuente oficial, la API debe exponer esa relación explícita.
La ausencia de modelos de 94 no está solucionada con código en Compras.

Ruta SPA: `#/compras/colegios`. GET `/api/colegios-compras?q=...` busca nombres
guardados en `contratos_referencia`; GET `/api/colegios-compras/:id` consulta el
contrato local seleccionado. Ahora combina las referencias locales con el listado
por estado (`pendiente`, `en_proceso`, `entregado`) de la API, sin cambiar los
filtros de preparación de pedidos. Se selecciona el servicio escolar Promoción.
La identidad
de unión es el ID del contrato de origen, nunca una similitud de nombres.
Los resultados sin referencia local usan `api-ID`; al consultarlos se verifica
primero si ya existe una referencia local y, si no, se muestra el colegio sin
compras, con total cero. Nunca se usan cantidades contratadas como compras.
Si la API falla, se mantienen los resultados locales y se informa la limitación.

La busqueda es parcial, insensible a mayusculas y tildes, con parametros SQL y
comodines escapados. Muestra hasta 20 coincidencias y pide precisar si hay mas.
Se muestra el numero del contrato para distinguir nombres coincidentes.

## Origen de las cantidades

El detalle parte de `contratoService.obtenerPorId(id_contrato_api)`: todos los
modelos y cantidades contratadas de la API aparecen, aunque no tengan compras.
La relación con productos locales utiliza `productos.id_modelo_api`.
Cada modelo muestra contratada, solicitada y por solicitar (máximo de cero y la
diferencia). Sin compras: proveedor Sin asignar, sin códigos, situación Por solicitar.
La consulta API fallida o inválida produce un error; nunca un contrato vacío.
Las compras históricas cuyo modelo ya no aparece en el contrato se conservan
con cantidad contratada desconocida, sin inventar una cantidad.
Las referencias de órdenes y proveedores se conservan dentro del modelo.

`contratos_referencia -> contrato_detalles -> orden_distribuciones -> orden_detalles
-> ordenes_compra -> proveedores`.

Cada distribucion se lee una sola vez. Se usa `cantidad_asignada`, nunca
`cantidad_requerida` ni las cantidades de la API como cantidades solicitadas. Un LEFT JOIN con
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
sin ningún contrato requieren una fuente adicional del sistema origen: un catálogo
de colegios con ID estable. Los históricos entregados con contrato sí se incluyen.

Verificación del 2 de noviembre de 2026: el listado en proceso devolvía 64 contratos;
la unión de estados devuelve 79 contratos escolares (79 nombres distintos), y el
buscador sin filtro cuenta los mismos 79. Se presentan hasta 20 coincidencias;
`total` indica el número completo y `hayMas` permite pedir una búsqueda más precisa.
La versión Node anterior en ejecución todavía respondía solo con referencias
locales; debe reiniciarse para cargar cambios de servicios.

Los códigos enlazan a la ruta existente de órdenes guardadas con `vista`,
`localizar` (ID real) y `codigo` (filtro inicial). Se abre la pestaña correspondiente
y se resalta la fila, sin abrir PDF ni ejecutar operaciones de guardado.

Comprobación de lectura de los datos actuales: FE Y ALEGRIA SECUNDARIA 5to c
tiene 25 unidades (10 LALO, 15 Joselito); COLEGIO JHON F KENNEDY tiene 21
pendientes. Existen operaciones repetidas anteriores en Santo Domingo Savio y
Paracas Inicial: no se eliminan ni fusionan automáticamente.
