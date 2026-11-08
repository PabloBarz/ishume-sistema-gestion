-- MANUAL. No ejecutar sobre otra base ni repetir si ya esta aplicada.
-- Base actual sin auditoria: aplicar primero propuestas/007_correcciones_abonos.sql.
-- No modifica pagos existentes. No modifica retroactivamente la migracion 007.
-- Detener escrituras durante la migracion y respaldar previamente la base.
USE bd_ishume;

ALTER TABLE correcciones_pago_proveedor
  ADD fecha_pago_anterior DATE NULL,
  ADD fecha_pago_nueva DATE NULL,
  ADD observacion_anterior TEXT NULL,
  ADD observacion_nueva TEXT NULL;

-- Sintaxis compatible con MariaDB y MySQL 8 para retirar el CHECK anterior.
SET @ishume_drop_check = IF(VERSION() LIKE '%MariaDB%',
  'ALTER TABLE correcciones_pago_proveedor DROP CONSTRAINT ck_correccion_cambio',
  'ALTER TABLE correcciones_pago_proveedor DROP CHECK ck_correccion_cambio');
PREPARE ishume_correccion_ddl FROM @ishume_drop_check;
EXECUTE ishume_correccion_ddl;
DEALLOCATE PREPARE ishume_correccion_ddl;

ALTER TABLE correcciones_pago_proveedor
  ADD CONSTRAINT ck_correccion_cambio_completo CHECK (
    monto_anterior <> monto_nuevo OR metodo_anterior <> metodo_nuevo
    OR NOT(fecha_pago_anterior <=> fecha_pago_nueva)
    OR NOT(observacion_anterior <=> observacion_nueva));

-- Los NULL de auditorias antiguas se conservan: sus datos originales no se inventan.
-- DDL realiza commit implicito. Si falla un paso, revisar el esquema antes de repetir.
