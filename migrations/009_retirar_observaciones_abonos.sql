-- PROPUESTA MANUAL. No ejecutar sin autorizacion y respaldo previo.
-- Desplegar primero el codigo actualizado y detener las escrituras de la aplicacion.
-- Solo retira pagos_proveedor.observaciones. Conserva pagos y auditorias historicas.
-- Si existe contenido, se detiene: exportarlo y decidir su conservacion antes de continuar.
-- DDL realiza commit implicito; no es una operacion reversible mediante ROLLBACK.
USE bd_ishume;
DELIMITER $$
CREATE PROCEDURE retirar_observaciones_abonos_ishume()
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='pagos_proveedor' AND COLUMN_NAME='observaciones') THEN
    IF EXISTS (SELECT 1 FROM pagos_proveedor WHERE observaciones IS NOT NULL AND CHAR_LENGTH(observaciones)>0 LIMIT 1) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Hay observaciones historicas: exportarlas y revisar antes de retirar la columna.';
    ELSE
      ALTER TABLE pagos_proveedor DROP COLUMN observaciones;
    END IF;
  END IF;
END$$
DELIMITER ;
CALL retirar_observaciones_abonos_ishume();
DROP PROCEDURE retirar_observaciones_abonos_ishume;
-- Si CALL se detiene, conservar los datos y revisar la rutina antes de reintentar.
