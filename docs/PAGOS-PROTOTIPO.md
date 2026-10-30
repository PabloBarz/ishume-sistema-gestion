# Pagos: modelo simplificado de 19 tablas

Propuesta preparada, NO aplicada a MySQL. No ejecutar los scripts antiguos que creaban cinco tablas.

## Cambios para aprobar en Workbench

1. `migrations/propuestas/003_pagos_ordenes_masivas.sql`:
   - solicitudes_cotizacion: importe_acordado, fecha_documento, archivo_clave, archivo_nombre y archivo_mime.
   - documento_revision evita sobrescribir cambios concurrentes; documento_operacion y documento_huella protegen reintentos. No son versiones de documentos: existe una sola referencia vigente por solicitud.
   - pagos_proveedor: cambia id_orden a id_solicitud y sustituye la FK por solicitudes_cotizacion(id_solicitud). Conserva fecha, monto, metodo, numero_operacion y observaciones. Agrega clave_operacion/huella para no duplicar abonos.
   - La conversion se detiene si existen pagos. No reinterpretar IDs de pedidos internos como IDs de solicitudes. En la revision actual habia 0 pagos.
2. `migrations/004_series_ordenes_masivas.sql`:
   - proveedores: prefijo_orden_masiva (UNIQUE) y ultimo_orden_masiva.
   - Inicializa desde el mayor codigo ORDEN-MAS existente del mismo ID proveedor. No modifica codigos guardados ni series OC-MAS o pedidos internos.
   - No repetir esta migracion: el contador persistente no se debe reiniciar.

DDL hace commit implicito. Revisar ambos archivos antes de ejecutarlos manualmente. No se ejecuto SQL de escritura desde Codex.

Para una base vacia, `database/ishume.sql` define directamente las 19 tablas finales. No ejecutar ademas las migraciones 001/003/004 sobre esa instalacion: ya contiene sus columnas y relaciones. No contiene DROP DATABASE ni TRUNCATE.

## Seguridad y funcionamiento

El servicio bloquea la solicitud con FOR UPDATE para guardar documento o registrar abonos. Archivo e importe inicial y adelanto se confirman en la misma transaccion SQL; si falla, se revierte y se limpia el archivo nuevo. Adelanto cero no crea un pago. Un reintento con la misma clave y datos devuelve el resultado, sin otro abono. Una correccion no registra un segundo adelanto y no admite un total inferior a lo ya pagado. Un formulario antiguo se rechaza por revision. Se conserva el historial de todos los abonos, sin borrarlos ni reasignarlos.

Saldo = importe_acordado - SUM(pagos_proveedor.monto), calculado, no almacenado. Los importes se validan en centimos. Cada abono conserva fecha y metodo real. La secuencia masiva bloquea la fila del proveedor y actualiza su contador en la transaccion de creacion; UNIQUE protege prefijos y codigos. Un rollback revierte el contador.

Los JPG/PNG/PDF se validan por contenido y se guardan fuera de public, en storage/pagos (o PAGOS_STORAGE_DIR). La base contiene solo la referencia vigente. No hay tablas de versiones ni de anulaciones. Los archivos sustituidos permanecen privados, sin acceso desde la aplicacion; no se borran automaticamente como parte de esta simplificacion.

El router actual permite acceso local y comprueba el origen; no sustituye un sistema de autenticacion para publicar en red. No se ha cambiado ese limite.

Hasta aprobar y aplicar las columnas, el listado sigue disponible sin inventar importes y el guardado informa que falta el esquema.

## Comprobacion

Tras aplicar manualmente los cambios y reiniciar Node: abrir Compras > Pagos, buscar una orden, abrir el ojo, adjuntar archivo, introducir importe y adelanto (fecha y metodo si corresponde). Guardar y comprobar Total/Abonado/Saldo. Registrar otro abono y consultar historial. Recargar para verificar persistencia. Probar reintento y sobrepago. Generar dos ordenes para un proveedor y otra para un proveedor diferente para comprobar las series independientes.

Las pruebas automatizadas de servicio usan transacciones simuladas y archivos temporales reales; no aplican migraciones ni escriben en MySQL. La persistencia con el esquema nuevo queda pendiente de su aprobacion y ejecucion manual.
