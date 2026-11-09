USE bd_ishume;
-- SOLO si ya aplicaste la version anterior de 003 y aun falta esta columna.
-- Si vas a aplicar la 003 actualizada o instalar database/ishume.sql, NO ejecutar 005.
-- Propuesta manual: no ejecutada por Codex. No crea tablas ni cambia fechas anteriores.
ALTER TABLE solicitudes_cotizacion
  ADD fecha_registro_documento DATETIME NULL
    COMMENT 'Registro del documento en America/Lima; no es emision del proveedor';
-- NULL en documentos anteriores: no conocemos su instante real de registro.
-- El servicio asigna CONVERT_TZ(UTC_TIMESTAMP(),'+00:00','-05:00') al guardar.
-- No usa DEFAULT CURRENT_TIMESTAMP: depende de la zona de sesion y asignaria
-- una fecha ficticia al agregar la columna a registros existentes.
