-- Aditiva: no altera ni elimina las 17 tablas originales.
CREATE TABLE solicitudes_cotizacion (
  id_solicitud INT NOT NULL AUTO_INCREMENT,
  codigo VARCHAR(30) NOT NULL,
  id_proveedor INT NOT NULL,
  fecha_emision DATE NOT NULL,
  estado ENUM('Generada','Enviada','Cotizada','Confirmada','Cancelada') NOT NULL DEFAULT 'Generada',
  clave_operacion CHAR(36) NOT NULL,
  huella CHAR(64) NOT NULL,
  contenido_json JSON NOT NULL,
  PRIMARY KEY (id_solicitud),
  UNIQUE KEY uq_sc_codigo (codigo),
  UNIQUE KEY uq_sc_operacion (clave_operacion),
  CONSTRAINT fk_sc_proveedor FOREIGN KEY (id_proveedor) REFERENCES proveedores (id_proveedor)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE solicitud_ordenes (
  id_solicitud INT NOT NULL,
  id_orden INT NOT NULL,
  PRIMARY KEY (id_solicitud, id_orden),
  UNIQUE KEY uq_so_orden (id_orden),
  CONSTRAINT fk_so_solicitud FOREIGN KEY (id_solicitud) REFERENCES solicitudes_cotizacion (id_solicitud),
  CONSTRAINT fk_so_orden FOREIGN KEY (id_orden) REFERENCES ordenes_compra (id_orden)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
