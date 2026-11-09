USE bd_ishume;
-- PROPUESTA MANUAL. No ejecutada por Codex. Conserva las 19 tablas.
-- Aplicar una sola vez con Node detenido. No mezclar con database/ishume.sql.
-- DDL hace commit implicito: los dos ALTER no se revierten como una transaccion.
-- La comprobacion previa evita reinterpretar pagos existentes como otras ordenes.
DELIMITER $$
CREATE PROCEDURE convertir_relacion_pagos_ishume()
BEGIN
  IF EXISTS (SELECT 1 FROM pagos_proveedor LIMIT 1) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Hay pagos existentes. Detener y preparar migracion de relaciones sin reasignar IDs.';
  ELSE
    ALTER TABLE solicitudes_cotizacion
      ADD importe_acordado DECIMAL(12,2) NULL,
      ADD fecha_registro_documento DATETIME NULL COMMENT 'Registro en America/Lima, distinto de la emision del proveedor',
      ADD archivo_clave VARCHAR(100) NULL,
      ADD archivo_nombre VARCHAR(255) NULL,
      ADD archivo_mime VARCHAR(50) NULL,
      ADD documento_revision INT UNSIGNED NOT NULL DEFAULT 0,
      ADD documento_operacion CHAR(36) NULL,
      ADD documento_huella CHAR(64) NULL,
      ADD UNIQUE KEY uq_sc_documento_operacion (documento_operacion),
      ADD UNIQUE KEY uq_sc_archivo (archivo_clave),
      ADD CONSTRAINT ck_sc_importe CHECK (importe_acordado IS NULL OR importe_acordado > 0);
    ALTER TABLE pagos_proveedor
      DROP FOREIGN KEY fk_pagos_proveedor_id_orden,
      CHANGE COLUMN id_orden id_solicitud INT NOT NULL,
      ADD fecha_registro DATETIME NULL COMMENT 'Registro automatico en America/Lima, NULL para pagos anteriores',
      ADD clave_operacion CHAR(36) NULL,
      ADD huella CHAR(64) NULL,
      ADD UNIQUE KEY uq_pago_operacion (clave_operacion),
      ADD CONSTRAINT fk_pago_solicitud FOREIGN KEY (id_solicitud) REFERENCES solicitudes_cotizacion(id_solicitud),
      ADD CONSTRAINT ck_pago_positivo CHECK (monto > 0);
  END IF;
END$$
DELIMITER ;
CALL convertir_relacion_pagos_ishume();
DROP PROCEDURE convertir_relacion_pagos_ishume;
-- Conserva fecha_pago, monto, metodo_pago, numero_operacion y observaciones.
-- La rutina es temporal, no una tabla adicional. No modifica registros actuales.
