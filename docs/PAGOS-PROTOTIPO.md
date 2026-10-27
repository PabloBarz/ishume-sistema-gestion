# Pagos a proveedores: prototipo

Ruta SPA: `#/pagos`. Utiliza las mismas vistas, navegación y estilos base del proyecto.

## Qué es real y qué es demostrativo

- Proveedores activos: `GET /api/proveedores`.
- Órdenes masivas: `GET /api/compras-masivas/solicitudes?q=PROVEEDOR&pagina=N`.
  Se consultan las páginas del proveedor elegido y se comprueba su `id_proveedor` real,
  sin mezclar resultados de otros proveedores. Se incluyen documentos históricos SC.
- El listado existente añade únicamente `colegios`, contado desde las distribuciones
  de la instantánea. No se agrega ningún endpoint, tabla ni operación de escritura.
- Importes acordados, cotizaciones y abonos: **simulación en memoria de la pantalla**.
  No se leen ni presentan como reales los pagos financieros de etapas anteriores.
- Cada simulación se identifica por `id_proveedor` e **`id_solicitud` de la orden masiva**,
  nunca por el nombre del proveedor ni por el ID de un pedido interno.
- Los archivos JPG/JPEG/PNG/PDF se validan por extensión, MIME y límite de 10 MB;
  solo se crean URL `blob:` locales para visualizarlos. No se suben ni guardan.
- Los importes se calculan en céntimos enteros; el saldo y estado se derivan de los abonos.
  Los pedidos sin importe acordado no entran en los totales monetarios del proveedor.
- Cambiar proveedor u orden conserva la demostración durante esa pantalla. Salir o recargar
  la reinicia y revoca las URL locales. No se usa localStorage, IndexedDB ni sesiones del servidor.
- Se bloquea el sobrepago, pagos antes de cotización, importes no positivos y doble envío
  del mismo formulario. Se pueden registrar abonos legítimos sucesivos con el mismo importe.

## Adaptación necesaria para pagos reales

La base actual tiene `pagos_proveedor.id_orden` con clave foránea a `ordenes_compra`:
son **pedidos internos**. La orden masiva corresponde a `solicitudes_cotizacion.id_solicitud`,
relacionada con varios pedidos mediante `solicitud_ordenes`. No se deben introducir IDs
masivos en `pagos_proveedor.id_orden` ni repartir pagos entre pedidos para eludir esta diferencia.

Antes de implementar persistencia debe acordarse y aprobarse una adaptación aditiva que:

1. Guarde la cotización, importe acordado y referencia del archivo para una orden masiva real.
2. Vincule cada abono a ese `id_solicitud`, conservando los pagos internos históricos existentes.
3. Valide proveedor, orden, importe, método y fecha en el servidor; derive el saldo y estado.
4. Use transacciones y bloqueo de la orden al abonar, con clave de idempotencia persistente.
5. Incorpore carga de archivos con validación de contenido, tamaño, almacenamiento privado,
   permisos de acceso y descarga. Las validaciones del navegador por sí solas no bastan.

**No se creó ni ejecutó una migración en esta versión.** No existe backend de registro
de cotizaciones o abonos. No cambian códigos, estados de compra, PDF ni consolidaciones.

## Cómo probar

1. Abre Pagos y selecciona un proveedor y una orden real.
2. Elige un archivo local e introduce un importe de prueba para registrar la cotización.
3. Pulsa Registrar abono y prueba varios importes hasta cancelar el saldo.
4. Cambia de proveedor y verifica que los totales se separan; vuelve para recuperar tu simulación.
5. Recarga o sal de la pantalla para comprobar el reinicio.

Pruebas: `node --test tests/pagos-ui.test.js`. Con `TEST_CHROME` configurado también
se prueban navegación, archivos, doble clic, estados, proveedores y móvil usando una API
simulada que rechaza cualquier petición que no sea GET. No escribe en MySQL.
