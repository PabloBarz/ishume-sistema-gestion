-- PROPUESTA PENDIENTE DE AUTORIZACION. No ejecutar automaticamente.
-- Una fila por correccion; no modifica pagos ni sus relaciones existentes.
-- La futura operacion debe bloquear la orden y el pago, comprobar los valores
-- esperados, validar el saldo e insertar esta evidencia en la misma transaccion.
-- Conservar clave_operacion y huella originales de pagos_proveedor para reintentos.
-- No existe autenticacion de usuarios actualmente: no se inventa responsable.
-- responsable_identificador permanece NULL hasta disponer de autenticacion;
-- solo el backend puede obtenerlo de la sesion verificada, nunca del formulario.
-- Esta tabla es un registro acumulativo: el servicio no debe editar ni borrar
-- sus filas. Crear la tabla no habilita por si solo la correccion de pagos.
CREATE TABLE correcciones_pago_proveedor (
  id_correccion INT NOT NULL AUTO_INCREMENT,
  id_pago INT NOT NULL,
  monto_anterior DECIMAL(12,2) NOT NULL,
  monto_nuevo DECIMAL(12,2) NOT NULL,
  metodo_anterior VARCHAR(50) NOT NULL,
  metodo_nuevo VARCHAR(50) NOT NULL,
  motivo VARCHAR(500) NOT NULL,
  fecha_correccion DATETIME NOT NULL COMMENT 'Fecha y hora America/Lima asignada por el backend',
  responsable_identificador VARCHAR(191) NULL COMMENT 'Identidad autenticada del servidor; NULL sin autenticacion',
  clave_operacion CHAR(36) NOT NULL,
  huella CHAR(64) NOT NULL,
  PRIMARY KEY (id_correccion),
  UNIQUE KEY uq_correccion_operacion (clave_operacion),
  KEY idx_correccion_pago (id_pago, id_correccion),
  CONSTRAINT fk_correccion_pago FOREIGN KEY (id_pago) REFERENCES pagos_proveedor (id_pago) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT ck_correccion_montos CHECK (monto_anterior > 0 AND monto_nuevo > 0),
  CONSTRAINT ck_correccion_motivo CHECK (CHAR_LENGTH(TRIM(motivo)) > 0),
  CONSTRAINT ck_correccion_metodo CHECK (metodo_nuevo IN ('Yape','Transferencia')),
  CONSTRAINT ck_correccion_cambio CHECK (monto_anterior <> monto_nuevo OR metodo_anterior <> metodo_nuevo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
