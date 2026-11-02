# Pagos de ISHUME: modelo de 19 tablas

## Modelo vigente

- ordenes_compra: pedidos internos.
- solicitudes_cotizacion: orden masiva, importe acordado y referencia al documento vigente.
- solicitud_ordenes: vincula los pedidos consolidados sin permitir incluirlos dos veces.
- pagos_proveedor.id_solicitud: adelanto y abonos de la orden masiva.
- proveedores: correlativo masivo persistente por ID, sin tabla de secuencias adicional.

Saldo = importe acordado - SUM(abonos). No se guarda otro saldo duplicado.

El esquema base de Pagos ya esta instalado en la base local revisada. No repetir 003 ni 004. Para instalaciones vacias, database/ishume.sql contiene directamente las 19 tablas y relaciones, sin ejecutar ALTER adicionales.

## Fecha automatica

El navegador envia monto, metodo y clave de operacion. No envia fecha_pago. El servicio valida el metodo (Yape/Transferencia), monto, saldo y clave. La fecha_pago se calcula dentro del INSERT con DATE(CONVERT_TZ(UTC_TIMESTAMP(),'+00:00','-05:00')). No depende del reloj del navegador ni de tablas de zonas horarias instaladas en MySQL.

fecha_pago es DATE en la base actual y conserva la fecha real de los registros anteriores. fecha_registro DATETIME es opcional: si existe, el mismo INSERT guarda tambien el instante de Peru. Si no existe, el abono funciona con fecha_pago; no se inventa una hora en las respuestas del historial. La migracion 006 para agregar hora sigue siendo una propuesta manual, no un requisito para guardar la fecha. No se ejecuto ninguna migracion automaticamente.

El pool configura cada sesion SQL con time_zone=-05:00, de modo que CURRENT_TIMESTAMP de otras tablas mantiene el horario Peru. No modifica registros anteriores.

## Seguridad

Cada escritura financiera bloquea la solicitud con FOR UPDATE. El adelanto inicial y el documento se guardan en la misma transaccion. Adelanto cero no crea abono. Los reintentos usan UUID y huella del contenido; repetir la misma operacion no duplica pagos. No se permiten sobrepagos ni reducir el importe acordado por debajo de lo pagado. Editar un documento nunca registra otro adelanto.

Los JPG/PNG/PDF se validan por contenido y extension y se guardan fuera de public, en storage/pagos o PAGOS_STORAGE_DIR. Solo las rutas autorizadas sirven los archivos. El router se limita a acceso local y comprueba el origen; no reemplaza una autenticacion para publicar el modulo en red.

## Interfaz

- Tabla general: cuatro iconos (+ abono, ojo, historial y lapiz), con tooltip y aria-label. Abono se deshabilita sin documento/importe o con saldo cero.
- Abono: importe y metodo; guarda, cierra y actualiza la tabla.
- Ojo: codigo, proveedor, documento, importes e historial en un solo modal de consulta, sin formulario ni acceso mezclado a edicion.
- Historial: abre directamente solo la tabla de pagos; si esta vacia, muestra Sin abonos registrados.
- Lapiz: registro inicial si no hay documento; edicion del archivo/importe si existe, sin volver a registrar adelantos.
- Editar documento: motivo en el propio formulario; permite conservar el archivo cuando solo cambia el importe.
- Fotografias: lightbox global reutilizable de utils.js, con imagen completa centrada sobre fondo oscuro y solo una X. Sin encabezado, pie, porcentajes ni barra. Doble clic y rueda amplian, arrastre permite desplazarse. X, Escape o fondo cierran la capa y restauran el foco sin cerrar ni reiniciar el detalle. Los elementos de fondo quedan temporalmente inert y se restaura su estado previo. PDF conserva su visor del navegador.
- Gestionar: #/pagos?localizar=ID localiza y resalta la fila, incluso en otra pagina, sin abrir el modal. El ojo utiliza #/pagos?orden=ID.

Los resultados de guardado usan showToast de public/js/utils.js. Exito: 4 segundos; error: 8 segundos por defecto, con cierre y pausa de lectura; advertencia disponible. Mensajes deduplicados, texto seguro y aria-live. Los errores de formulario siguen visibles y conservan los datos. Los pedidos nuevos limpian el formulario solamente despues de la confirmacion del backend, sin modal de exito.

## Comprobaciones

Las pruebas de navegador usan respuestas simuladas. Las pruebas del servicio comprueban transacciones, sobrepagos, idempotencia y archivos temporales reales.

Prueba opcional MySQL: TEST_PAGOS_MYSQL_ROLLBACK=1 node --test tests/pagos-backend.test.js. Usa una transaccion real, inserta un ID negativo explicito para no consumir AUTO_INCREMENT, recupera y reintenta el abono y revierte todo. Comprueba que no quede el registro y que el contador no cambie. No crea tablas ni modifica esquemas.

Diagnostico del error Fecha invalida: el servidor del puerto 3000 seguia ejecutando codigo cargado antes de quitar la fecha obligatoria. Se identifico y reinicio solo ese proceso. Despues, el endpoint rechazo correctamente un metodo no permitido y un sobrepago sin solicitar fecha ni registrar pagos. Reiniciar Node cuando se cambie el backend para cargar la nueva version.

## Estandar global de resultados

Componente unico: showToast(message, type, duration) exportado por public/js/utils.js. Estilos unicos: seccion Toast de components.css y su adaptacion en responsive.css. No hay implementaciones por modulo ni librerias adicionales.

Copias normalizadas: N pedidos guardados (singular cuando corresponde), Orden de compra generada, Documento guardado, Abono registrado y Cambios actualizados para una correccion del documento. Solo se anuncian tras confirmar la respuesta del backend. No quedan modales exclusivos de exito ni mensajes de exito permanentes bajo los listados. Se conservan revision y confirmacion previas, consultas e historial.

Los errores de carga, revision, guardado y descarga de PDF usan el mismo Toast rojo, ademas del estado local que permite revisar o reintentar. Los errores de importe de un abono tambien aparecen junto al campo con aria-invalid. Las advertencias al validar se emiten al intentar una accion, no por cada tecla. Quitar un colegio del formulario informa con un Toast informativo, sin afirmar que se guardo un cambio en MySQL. Dashboard es demostrativo sin escrituras; Vista de ejemplo ya reutiliza showToast y conserva la indicacion de demostracion.

Verificado en navegador: nuevo pedido, error con reintento, guardado unico, consolidacion, consulta y descarga PDF, registro y edicion de documento, abonos e historial. Se comprueba que no se borren los datos al fallar, no se repitan envios por doble clic y no se duplique el resultado en la vista. Las pruebas utilizan respuestas simuladas y no escriben en la base de datos.

Diseno global del Toast restaurado: fondo blanco, borde lateral de 3 px segun el tipo, check verde, texto oscuro, esquinas redondeadas, sombra discreta y cierre X. Se mantienen el componente global, cierre automatico, deduplicacion, accesibilidad y adaptacion movil.


Edicion suspendida: `src/config/pagosConfig.js` centraliza los permisos. Sin `PAGOS_EDITAR_COTIZACIONES=true`, el listado no ofrece el lapiz y el servicio rechaza correcciones con HTTP 403, incluso si se intenta presentar una correccion como registro inicial. Los reintentos identicos de registros iniciales siguen siendo idempotentes. Para reactivar cotizaciones, establecer esa variable en `.env`, reiniciar Node y recargar la vista. La correccion individual de abonos sigue pendiente de implementacion y no tiene endpoint; la propuesta SQL se conserva sin ejecutarse.
