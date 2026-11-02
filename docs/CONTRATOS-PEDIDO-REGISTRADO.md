# Contratos con pedidos registrados

La disponibilidad se determina por `contratos_referencia.id_contrato_api`, siguiendo las relaciones existentes con `contrato_detalles`, `orden_distribuciones`, `orden_detalles` y `ordenes_compra`. No se compara el nombre del colegio ni el estado de trabajo de la API externa.

El buscador conserva los resultados y marca como «Pedido registrado» los contratos con distribuciones persistidas. «Agregado» solo representa una selección temporal del formulario. Consultar colegios conserva su consulta y trazabilidad.

La confirmación reutiliza el bloqueo MySQL `ishume_compra_masiva` y verifica los contratos dentro de la transacción antes de insertar. Dos operaciones distintas para un mismo contrato no pueden guardarse simultáneamente. Los reintentos con la misma clave de una operación ya guardada recuperan su resultado mediante la idempotencia existente.

Un pedido consolidado sigue bloqueando el contrato. Tampoco se desbloquean automáticamente pedidos cancelados, anulados o reemplazados: cualquier repetición requerirá una regla explícita posterior. Los registros existentes, incluso duplicados anteriores a esta protección, permanecen intactos.

No requiere tablas, columnas ni migraciones nuevas. Las pruebas de concurrencia usan conexiones simuladas; la comprobación de la base actual es de solo lectura.
