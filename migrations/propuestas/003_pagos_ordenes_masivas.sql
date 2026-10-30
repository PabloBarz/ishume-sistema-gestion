USE bd_ishume;
-- PROPUESTA PARA WORKBENCH. No ejecutada. Requiere las 19 tablas originales.
-- No aplicar las antiguas propuestas que creaban tablas financieras.
ALTER TABLE solicitudes_cotizacion
  ADD importe_acordado DECIMAL(12,2) NULL,
  ADD fecha_documento DATE NULL,
  ADD archivo_clave VARCHAR(100) NULL,
  ADD archivo_nombre VARCHAR(255) NULL,
  ADD archivo_mime VARCHAR(50) NULL,
  ADD documento_revision INT UNSIGNED NOT NULL DEFAULT 0,
  ADD documento_operacion CHAR(36) NULL,
  ADD documento_huella CHAR(64) NULL,
  ADD UNIQUE KEY uq_sc_documento_operacion (documento_operacion),
  ADD UNIQUE KEY uq_sc_archivo (archivo_clave),
  ADD CONSTRAINT ck_sc_importe CHECK (importe_acordado IS NULL OR importe_acordado > 0);

-- Esta conversion SOLO es valida si pagos_proveedor esta vacia.
-- No se puede reinterpretar id_orden como id_solicitud cuando existen pagos.
DELIMITER $$
CREATE PROCEDURE convertir_relacion_pagos_ishume()
BEGIN
  IF EXISTS (SELECT 1 FROM pagos_proveedor LIMIT 1) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Hay pagos existentes. Detener y preparar migracion de relaciones sin reasignar IDs.';
  ELSE
    ALTER TABLE pagos_proveedor
      DROP FOREIGN KEY fk_pagos_proveedor_id_orden,
      CHANGE COLUMN id_orden id_solicitud INT NOT NULL,
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
-- DDL hace commit implicito; revisar y aprobar antes de ejecutar.
