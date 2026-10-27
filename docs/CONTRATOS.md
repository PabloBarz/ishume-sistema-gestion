# Consulta de contratos

## Flujo vigente: pedidos y órdenes de compra masivas

La pantalla **Preparar pedidos** guarda pedidos internos por proveedor en las tablas existentes. Conservan sus códigos e identificadores internos y no generan un PDF masivo al guardarse. El resumen muestra unidades por proveedor y total general.

En **Pedidos pendientes**, selecciona pedidos completos de un proveedor y pulsa **Preparar orden de compra**. La confirmación mantiene selección parcial, transacciones, huella de revisión, clave de operación y restricción única por pedido. Buscar por proveedor o código ignora mayúsculas y conserva las casillas al filtrar o cambiar de página.

Las nuevas consolidaciones usan `OC-MAS-000123`, basado en el ID autoincremental existente, sin reiniciar contadores. Se comprueban colisiones en ambas tablas y se guarda una instantánea con `version_documento: 4`. No se modifican los códigos históricos OC ni SC, ni se requiere migración. Los nombres técnicos `solicitudes_cotizacion` y `solicitud_ordenes` permanecen.

Los nuevos documentos se titulan **ORDEN DE COMPRA**, muestran su código OC y no incluyen precios. Los documentos históricos sin esa versión conservan el formato anterior y su contenido guardado. Generar o descargar un documento no lo marca como Enviado.

La versión 3 usa ISHUME en naranja `#FF7A00`, encabezado y tablas neutrales, nota de precios pendientes y archivo `CODIGO_Proveedor.pdf`, con caracteres seguros. Los documentos de versión 2 conservan el diseño previo de orden de compra; los anteriores siguen con su diseño de solicitud. Cambiar el formato no reescribe las instantáneas históricas ni sus cantidades.

La versión 4 añade el RUC proporcionado y los contactos provisionales identificados en `emisorPdf`, omite notas y muestra tipo, categoría y nivel solo si existen en la instantánea. Conserva el nombre seguro del archivo. Las características se incluyen en nuevas instantáneas desde `productos`; no se completan documentos históricos con el catálogo actual. Consulta el diagnóstico del contrato 94 y la propuesta de series, no ejecutada, en [DIAGNOSTICO-22230-Y-SERIES.md](DIAGNOSTICO-22230-Y-SERIES.md).

El buscador de Órdenes guardadas funciona al escribir, con debounce de 300 ms, botón para limpiar, comparación sin mayúsculas ni tildes y paginación desde el servidor. Se descartan respuestas desactualizadas y se conservan las casillas por ID de pedido.

En **Órdenes generadas**, los resultados de cada página se agrupan visualmente por ID de proveedor, con cantidad de documentos y suma de unidades de esos resultados. Se conserva la paginación de 20 documentos: no se fusionan órdenes ni se presentan los subtotales de una página como totales de todo el historial. Cada fila conserva código, fecha, unidades, estado y las acciones de ojito, Ver PDF y Descargar PDF. El ojito reutiliza la ventana existente y `GET /api/compras-masivas/solicitudes/ID`; muestra exclusivamente la instantánea de esa orden, con código masivo, fecha y desglose por colegio.

El PDF formal (versión 3) mantiene el naranja de la marca y usa etiquetas alineadas, filas compactas, bordes de 0,25 pt, menor separación entre colegios y franja `TOTAL GENERAL: X UNIDADES`. Solo cambia la presentación; códigos, datos y cantidades permanecen en sus instantáneas. Los formatos anteriores conservan su representación previa.

Los ojitos reutilizan una ventana de consulta: el individual obtiene un solo pendiente y el general todos los pendientes del proveedor, independientemente del filtro o las casillas. Los nuevos endpoints GET son `/api/compras-masivas/pendientes/ID/detalle` y `/api/compras-masivas/pendientes/proveedor/ID/detalle`. Ambos usan una transacción de solo lectura y reutilizan las consultas de productos y distribución de la consolidación; no crean revisiones, documentos, vínculos ni cambios de estado. Los importes y cantidades provienen de MySQL; los nombres de colegio se verifican con la API para no presentar como colegio una referencia histórica que contiene el cliente. Si no se puede verificar, la ventana muestra el aviso y permite cerrar.

El guardado nuevo utiliza `colegio` de la API, nunca `cliente`. Para consolidar pedidos antiguos se verifica el colegio por su ID externo sin reescribir las referencias históricas. Si falta colegio o una referencia externa verificable, se bloquea la nueva generación con un aviso. Las instantáneas ya generadas no se corrigen ni reinterpretan automáticamente.

Pruebas: `tests/compra-masiva-ui.test.js`, `tests/compra-masiva.test.js`, `tests/solicitudes-cotizacion.test.js` y `tests/orden-compra-pdf.test.js`. Las pruebas de escritura con `TEST_MYSQL=1` revierten sus datos al terminar; pueden consumir números de autoincremento. Las secciones siguientes conservan notas de las etapas anteriores del proyecto.

1. Configura en tu archivo `.env` la URL real del endpoint del sistema original:

   ```dotenv
   CONTRATOS_API_URL=http://localhost/sistema-original/api/contratos.php
   ```

   La dirección anterior es un ejemplo. Usa el nombre real del archivo (`contrato.php` o `contratos.php`) y la ruta de tu instalación. El servicio agrega el parámetro `id` en cada consulta.

2. Inicia el proyecto con `npm start` (Node.js 18 o posterior).
3. Abre `http://localhost:3000/#/ordenes/nueva` o despliega **Órdenes de compra → Nueva orden** en el menú. Los enlaces anteriores `#/contratos` se redirigen a esta pantalla.
4. Pulsa **+ Agregar colegio** e ingresa un ID existente. Puedes realizar otra búsqueda sin recargar la página.

El campo `cliente` se muestra completo, incluyendo el colegio, comas y guiones que tenga el nombre original. Los modelos y cantidades provienen de `productos`. Una fecha nula y un contrato sin modelos tienen mensajes propios.

Flujo: `public/views/contratos.html` → `public/js/modules/contratos.js` → `GET /api/contratos?id=...` → `src/routes/contratoRouter.js` → `src/controllers/contratoController.js` → `src/services/contratoService.js` → API externa.

Consultar contratos no escribe en MySQL. Confirmar una compra masiva sí registra las órdenes y sus distribuciones. La URL externa se configura en el servidor, no en el navegador. Tras cambiar `.env`, reinicia Node.js. El endpoint debe ser accesible desde la máquina donde corre Node.js.

Verificación automatizada con un servidor externo simulado: `node --test tests/contratos.test.js`.

## Órdenes de compra

1. Inicia MySQL y Apache en XAMPP y reinicia Node con `npm start`.
2. Despliega **Órdenes de compra** y abre **Nueva orden**. Los proveedores se obtienen de `proveedores` con `estado = 'Activo'`.
3. Pulsa **+ Agregar colegio** y consulta un ID real (por ejemplo, 8). El formulario se cierra al agregarlo y se desplaza al colegio nuevo. Cada cabecera tiene una numeración consecutiva que se actualiza al quitar colegios. El botón permanece debajo del último colegio. Un ID ya cargado no se vuelve a agregar.
4. En cada modelo selecciona proveedor y cantidad a pedir. Si el contrato indica 30 y escribes 35, aparece **+5 extra**. No se permiten cantidades menores que la original, fracciones, vacíos ni cantidades fuera del rango de un entero MySQL.
5. Durante la edición solo aparece un resumen compacto con colegios agregados y total de unidades a pedir. Las cantidades inválidas no se suman y se señalan para corregirlas.
6. Pulsa **Preparar órdenes**. El servidor verifica nuevamente contratos y proveedores; todavía no escribe datos. La edición se oculta y se muestra una vista de revisión con las tablas completas por proveedor: modelos, cantidades y distribución por colegio. Cada total destacado aparece al final de su tabla. El botón para agregar colegios solo está visible en edición.
7. Pulsa **Confirmar y guardar**. Se crea una orden **Borrador** por proveedor, con precios pendientes (`NULL`). Aparecen tarjetas con código, proveedor, estado, unidades, modelos distintos y botones **Ver PDF** y **Descargar PDF**. **Volver a editar** regresa al resumen e invalida la revisión anterior.
8. **Nueva orden de compra** inicia otra operación independiente. Después de guardar solo aparecen las tarjetas y las opciones para iniciar otra orden o ir a guardadas. **Volver a editar** conserva los colegios, las cantidades y los proveedores, pues no se reemplaza su DOM. Las cantidades no confirmadas permanecen solo en esta vista; se descartan al navegar a otra pantalla o recargar.

Los códigos nuevos tienen la forma `OC-JOS-0013`, `OC-LAL-0014` y `OC-LIB-0015`. El sufijo parte del ID autoincremental de la orden, con un mínimo de cuatro dígitos (no se reinicia por proveedor). Un código temporal se reemplaza por el definitivo dentro de la misma transacción; se comprueban colisiones y se respeta el índice único existente. Los códigos ya guardados, incluidos los anteriores de formato largo, no se renumeran. Los saltos por autoincremento o transacciones revertidas son normales.

La transacción escribe únicamente en `contratos_referencia`, `productos`, `contrato_detalles`, `ordenes_compra`, `orden_detalles` y `orden_distribuciones`, y valida los IDs en `proveedores`. Las otras diez tablas existentes corresponden a etapas posteriores y no se modifican. No se ejecutan cambios de estructura ni se modifica el PHP.

Las referencias se vinculan por `id_contrato_api` e `id_modelo_api`. La cantidad original queda en `contrato_detalles.cantidad_requerida`; la cantidad pedida queda en `orden_detalles` y su reparto en `orden_distribuciones`. Si cambia la cantidad original de la API, se conserva la versión anterior usada por órdenes históricas. Las cantidades adicionales pertenecen al colegio de la fila.

Cada revisión tiene un token válido durante 30 minutos en el proceso Node. Un reinicio requiere preparar nuevamente las revisiones aún no guardadas. La confirmación usa un bloqueo MySQL y un identificador persistente en `ordenes_compra.observaciones`; reintentar el mismo token devuelve las órdenes existentes incluso tras reiniciar, sin duplicarlas. Si cambia la API o un proveedor entre revisión y confirmación, se exige revisar de nuevo. Una nueva revisión confirmada se considera una compra distinta.

### Archivos

- `public/views/contratos.html`: pantalla, revisión y confirmación.
- `public/js/modules/contratos.js`: estado de colegios, edición, resumen y peticiones.
- `public/views/ordenes_guardadas.html` y `public/js/modules/ordenes_guardadas.js`: pantalla independiente con buscador, paginación y detalles de órdenes guardadas.
- `public/js/modules/ordenesCompraUi.js`: tarjetas y controles PDF compartidos por ambas pantallas.
- `public/js/utils.js`: peticiones HTTP compartidas con límite de 20 segundos, incluida la lectura del cuerpo; errores y validaciones reutilizados por el formulario.
- `public/css/components.css`, `forms.css` y `tables.css`: tarjetas, formularios y tablas usando el estilo existente.
- `public/index.html`, `public/js/router.js`, `public/js/sidebar.js` y `public/css/layout.css`: submenú desplegable y navegación entre `#/ordenes/nueva` y `#/ordenes/guardadas`, conservando compatibilidad con `#/contratos`.
- `src/routes/proveedorRouter.js`, `src/controllers/proveedorController.js`, `src/services/proveedorService.js`: consulta de proveedores activos.
- `src/routes/compraMasivaRouter.js`, `src/controllers/compraMasivaController.js`, `src/services/compraMasivaService.js`: revisión y guardado transaccional.
- `src/server.js`: registro de los nuevos endpoints.
- `tests/compra-masiva.test.js`: agrupación, validación, distribuciones, reintentos y rollback.
- `tests/compra-masiva-ui.test.js`: flujo de navegador con API y guardado simulados; se activa configurando `TEST_CHROME` con la ruta de Chrome.

Pruebas normales: `node --test tests/*.test.js`.

Prueba de escritura transaccional en MySQL (PowerShell):

```powershell
$env:TEST_MYSQL='1'
node --test tests/compra-masiva.test.js
Remove-Item Env:TEST_MYSQL
```

Esta prueba ejecuta escrituras reales y las revierte sin confirmar compras. MySQL puede consumir valores de autoincremento aunque se revierta la transacción. No altera tablas ni proveedores existentes.

## Solicitud de cotización por proveedor

Después de confirmar, cada tarjeta conserva **Ver PDF**, que abre el documento en otra pestaña con `Content-Disposition: inline`, y **Descargar PDF**, que devuelve `attachment`. El comportamiento final de apertura también depende de la configuración del visor PDF del navegador. El documento inicial se titula **SOLICITUD DE COTIZACIÓN** y su archivo se llama `Solicitud-cotizacion-CODIGO.pdf`. Se mantiene el código único ya guardado y el nombre del módulo **Órdenes de compra**.

El encabezado incluye ISHUME, título, código y fecha de emisión. La información general muestra proveedor y cantidad de colegios incluidos (referencias de contratos guardadas en esta orden). Después de **DETALLE DE PRODUCTOS SOLICITADOS** y la frase de solicitud, cada colegio conserva su nombre completo y tiene una sola tabla de descripción del modelo/cantidad y su subtotal. No hay una tabla general duplicada. El total general se presenta en un recuadro gris discreto a la derecha; el pie incluye **ISHUME · Sistema de gestión de compras** y páginas numeradas. Los encabezados de tabla, incluido el colegio, se repiten al continuar su sección en otra página; las filas y subtotales no se duplican. La última sección reserva espacio para el total general.

Para consultar posteriormente, abre **Órdenes de compra → Órdenes guardadas** (`#/ordenes/guardadas`). **Pedidos pendientes** agrupa las órdenes completas por proveedor, seleccionadas inicialmente. Desmarca las que no quieras incluir y pulsa **Preparar solicitud**. Revisa colegios, modelos y cantidades antes de **Confirmar y generar**. Las órdenes no seleccionadas permanecen pendientes. **Volver a seleccionar** conserva las casillas. **Pedidos realizados** muestra las solicitudes consolidadas: código, proveedor, fecha, estado, unidades, detalles y botones PDF. Permite buscar por código o proveedor, con 20 solicitudes por página. Los pendientes se paginan por grupos de 10 proveedores. No necesitas conocer los IDs de MySQL.

La solicitud siempre incluye los colegios y sus cantidades. Se retiraron los controles opcionales anteriores para evitar ocultar colegios o volver a mostrar categorías e IDs. El documento no incluye estados internos, observaciones, precios, descuentos ni IDs de contrato. Los nombres de modelos y colegios se muestran completos tal como están guardados; no se eliminan partes de sus nombres. Si una orden antigua tiene productos sin distribución registrada, aparecen identificados como productos sin distribución, sin inventar nombres de colegios.

El endpoint `/api/compras-masivas/ordenes/ID/pdf` conserva compatibilidad con enlaces anteriores. Agrega `?vista=1` para vista previa. Los parámetros antiguos de categoría/distribución/contrato ya no alteran el formato formal ni ocultan colegios. Los IDs quedan dentro de los enlaces, sin pedírselos al usuario. `GET /api/compras-masivas/ordenes/ID` sigue disponible. Reinicia Node después de instalar las dependencias con `npm install` si copias este proyecto a otro equipo.

La descarga solo realiza SELECT sobre MySQL en una transacción de lectura consistente. No llama a la API PHP ni crea órdenes. El PDF se genera de nuevo a partir de los registros guardados, incluyendo órdenes anteriores. No depende de la revisión temporal de compra masiva.

Implementación: `compraMasivaService.obtenerOrden()` consulta MySQL; `ordenCompraPdfService.js` genera el documento en Node con **jsPDF + jsPDF-AutoTable**. AutoTable organiza las tablas y los saltos de página. El controlador conserva los modos de vista previa y descarga y asigna el nombre del archivo. `ordenesCompraUi.js` comparte ambos botones entre Nueva orden y Órdenes guardadas. No se cambia ninguna tabla ni la lógica de guardado.

### Continuidad del proceso de compra

La preparación guarda las órdenes y distribuciones en estado Borrador, con precios pendientes. La estructura actual ya tiene estados Enviada/Cotizada/Confirmada, `cotizacion_archivo`, `fecha_cotizacion`, precios unitarios por línea en `orden_detalles` y pagos vinculados en `pagos_proveedor`, además de recepción e inventario. Esto permite continuar con la cotización recibida y los importes acordados en una etapa posterior. No se implementa ahora ningún registro de precios, cálculo de descuentos, pantalla de aprobación ni cambio automático de estado. Actualmente no existe un campo independiente para un importe global acordado: ese detalle deberá definirse al implementar su registro, sin agregar columnas en este cambio.

Pruebas del PDF: `node --test tests/orden-compra-pdf.test.js`. Con `TEST_MYSQL=1` también se descarga dos veces una orden existente, se comprueban sus cantidades y se verifica que no se crearon órdenes. Si aún no existen órdenes guardadas, esa comprobación se omite.

Pruebas del tiempo límite de consulta y recuperación: `node --test tests/http.test.js`. La prueba de navegador cubre consultas fallidas, numeración, tarjetas, navegación, filtros de búsqueda y botones PDF con datos simulados.

## Consolidación de solicitudes

La migración `migrations/001_solicitudes_cotizacion.sql` agrega únicamente `solicitudes_cotizacion` y `solicitud_ordenes`. Se aplicó después de verificar las 17 tablas originales y comprobar que sus definiciones no cambiaron. En otra instalación debe ejecutarse una sola vez sobre el esquema original. No volver a ejecutarla en una base ya migrada.

Las claves foráneas vinculan solicitudes con proveedores y órdenes. El índice único sobre `solicitud_ordenes.id_orden` impide incluir una orden en dos solicitudes. La consolidación no fusiona, elimina ni cambia el estado de las órdenes originales. Una orden pendiente no está vinculada a una solicitud; las canceladas no se ofrecen para consolidar. Las solicitudes nacen en estado **Generada**. Descargar o visualizar el PDF no las marca como enviadas.

`src/services/solicitudCotizacionService.js` valida proveedor único, cantidades y distribuciones; utiliza transacciones, bloqueo de órdenes y una clave de operación persistente para reintentos. El contenido consolidado queda guardado como JSON histórico en la solicitud, conservando nombres y cantidades aunque cambien los catálogos. Se reutiliza `ordenCompraPdfService.js` sin rediseñarlo. El router/controlador existentes añaden `/pendientes`, `/solicitudes`, `/solicitudes/revisar`, `/solicitudes/confirmar`, `/solicitudes/ID` y `/solicitudes/ID/pdf`, bajo `/api/compras-masivas`. Los endpoints anteriores siguen disponibles.

La interfaz utiliza la vista y módulo `ordenes_guardadas`; `ordenesCompraUi.js` admite tarjetas y enlaces de solicitudes conservando su comportamiento predeterminado para Nueva orden. Los estilos adicionales están en `public/css/components.css`.

Prueba MySQL: configurar `TEST_MYSQL=1` y ejecutar `node --test tests/solicitudes-cotizacion.test.js`. Sus datos se revierten: comprueba consolidación parcial, proveedor único, reintentos, restricciones, rollback, historial, PDF y conservación de órdenes originales. Puede consumir valores de autoincremento. La prueba de navegador `tests/compra-masiva-ui.test.js`, con `TEST_CHROME` apuntando a Chrome, verifica selección, revisión, vuelta atrás, doble clic, pendientes restantes, historial y PDF, además del flujo anterior de Nueva orden.
