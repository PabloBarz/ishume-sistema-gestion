USE bd_ishume;
-- PROPUESTA MANUAL: aplicar solo si esta columna no existe. No ejecutada por Codex.
-- Agrega una columna, ninguna tabla. No cambia fecha_pago ni los abonos existentes.
ALTER TABLE pagos_proveedor
  ADD fecha_registro DATETIME NULL
    COMMENT 'Registro automatico en America/Lima, NULL para pagos anteriores';
-- Los registros anteriores conservan NULL porque no se conoce su hora real.
-- El servicio genera fecha_pago y fecha_registro en MySQL con horario Peru.
-- No se aceptan fechas historicas desde los formularios normales.
