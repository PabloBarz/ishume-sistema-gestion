-- INSTALACION COMPLETA EN BASE VACIA. No elimina bases ni reinicia contadores.
-- No usar este script completo sobre la base de pruebas existente; usar las migraciones indicadas.
-- ISHUME | Sistema de Gestion y Control de Compras e Inventario
-- MySQL 8.0+ / MariaDB compatible (XAMPP)
-- 19 tablas: 17 originales y 2 de consolidacion. Pagos reutiliza estas tablas.
-- Motor InnoDB y restricciones CONSTRAINT explicitas para las claves foraneas.
-- Ejecutar en phpMyAdmin > SQL.
-- Nota: la aplicacion debe validar que los productos de cada orden corresponden
-- al proveedor, y que contratos/distribuciones/cajas/despachos son consistentes.

CREATE DATABASE IF NOT EXISTS bd_ishume CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE bd_ishume;

-- 1. Proveedores: una orden pertenece a un solo proveedor.
CREATE TABLE IF NOT EXISTS proveedores (
    id_proveedor INT AUTO_INCREMENT PRIMARY KEY,
    razon_social VARCHAR(200) NOT NULL,
    prefijo_orden_masiva VARCHAR(8) NULL,
    ultimo_orden_masiva BIGINT UNSIGNED NOT NULL DEFAULT 0,
    UNIQUE KEY uq_proveedor_prefijo_masivo (prefijo_orden_masiva),
    ruc VARCHAR(20) NULL,
    telefono VARCHAR(30) NULL,
    correo VARCHAR(150) NULL,
    direccion VARCHAR(255) NULL,
    especialidad VARCHAR(150) NULL,
    estado ENUM('Activo','Inactivo') NOT NULL DEFAULT 'Activo',
    UNIQUE KEY uq_proveedor_ruc (ruc)
) ENGINE=InnoDB;

-- 2. Productos/modelos: catalogo general, NO catalogo por proveedor.
CREATE TABLE IF NOT EXISTS productos (
    id_producto INT AUTO_INCREMENT PRIMARY KEY,
    id_modelo_api INT NULL,
    nombre VARCHAR(180) NOT NULL,
    tipo VARCHAR(100) NULL,
    categoria VARCHAR(100) NULL,
    nivel_educativo VARCHAR(100) NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    UNIQUE KEY uq_producto_modelo_api (id_modelo_api)
) ENGINE=InnoDB;

-- 3. Contratos: API principal o pedidos manuales excepcionales.
CREATE TABLE IF NOT EXISTS contratos_referencia (
    id_contrato INT AUTO_INCREMENT PRIMARY KEY,
    id_contrato_api INT NULL,
    origen ENUM('API','MANUAL') NOT NULL DEFAULT 'API',
    cliente_colegio VARCHAR(250) NOT NULL,
    fecha_entrega DATE NULL,
    fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    observaciones TEXT NULL,
    UNIQUE KEY uq_contrato_api (id_contrato_api)
) ENGINE=InnoDB;

-- 4. Detalles solicitados por cada contrato.
CREATE TABLE IF NOT EXISTS contrato_detalles (
    id_detalle_contrato INT AUTO_INCREMENT PRIMARY KEY,
    id_contrato INT NOT NULL,
    id_producto INT NOT NULL,
    cantidad_requerida INT NOT NULL,
    CONSTRAINT fk_contrato_detalles_id_contrato FOREIGN KEY (id_contrato) REFERENCES contratos_referencia(id_contrato),
    CONSTRAINT fk_contrato_detalles_id_producto FOREIGN KEY (id_producto) REFERENCES productos(id_producto),
    INDEX idx_cd_contrato (id_contrato)
) ENGINE=InnoDB;

-- 5. Orden formal dirigida a UN proveedor; incluye imagen/PDF de cotizacion.
CREATE TABLE IF NOT EXISTS ordenes_compra (
    id_orden INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(30) NOT NULL,
    id_proveedor INT NOT NULL,
    fecha_emision DATE NOT NULL,
    estado ENUM('Borrador','Enviada','Cotizada','Confirmada','Cancelada') NOT NULL DEFAULT 'Borrador',
    cotizacion_archivo VARCHAR(255) NULL,
    fecha_cotizacion DATE NULL,
    tipo_comprobante VARCHAR(40) NULL,
    numero_comprobante VARCHAR(60) NULL,
    observaciones TEXT NULL,
    fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_orden_codigo (codigo),
    CONSTRAINT fk_ordenes_compra_id_proveedor FOREIGN KEY (id_proveedor) REFERENCES proveedores(id_proveedor)
) ENGINE=InnoDB;

-- 6. Una linea por producto/modelo consolidado en la orden.
CREATE TABLE IF NOT EXISTS orden_detalles (
    id_orden_detalle INT AUTO_INCREMENT PRIMARY KEY,
    id_orden INT NOT NULL,
    id_producto INT NOT NULL,
    cantidad_pedida INT NOT NULL,
    precio_unitario DECIMAL(12,2) NULL,
    CONSTRAINT fk_orden_detalles_id_orden FOREIGN KEY (id_orden) REFERENCES ordenes_compra(id_orden),
    CONSTRAINT fk_orden_detalles_id_producto FOREIGN KEY (id_producto) REFERENCES productos(id_producto),
    UNIQUE KEY uq_od_orden_producto (id_orden,id_producto)
) ENGINE=InnoDB;

-- 7. Tabla clave: reparte cada linea entre varios contratos/colegios.
CREATE TABLE IF NOT EXISTS orden_distribuciones (
    id_distribucion INT AUTO_INCREMENT PRIMARY KEY,
    id_orden_detalle INT NOT NULL,
    id_detalle_contrato INT NOT NULL,
    cantidad_asignada INT NOT NULL,
    CONSTRAINT fk_orden_distribuciones_id_orden_detalle FOREIGN KEY (id_orden_detalle) REFERENCES orden_detalles(id_orden_detalle),
    CONSTRAINT fk_orden_distribuciones_id_detalle_contrato FOREIGN KEY (id_detalle_contrato) REFERENCES contrato_detalles(id_detalle_contrato),
    UNIQUE KEY uq_dist_linea_contrato (id_orden_detalle,id_detalle_contrato)
) ENGINE=InnoDB;

-- 8. Abonos al proveedor (el saldo se calcula, no se duplica).
CREATE TABLE IF NOT EXISTS recepciones (
    id_recepcion INT AUTO_INCREMENT PRIMARY KEY,
    id_orden INT NOT NULL,
    fecha_recepcion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    responsable VARCHAR(120) NULL,
    observaciones TEXT NULL,
    CONSTRAINT fk_recepciones_id_orden FOREIGN KEY (id_orden) REFERENCES ordenes_compra(id_orden)
) ENGINE=InnoDB;

-- 10. Caja: pertenece a una recepcion y a UN contrato/colegio.
CREATE TABLE IF NOT EXISTS cajas (
    id_caja INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(50) NOT NULL,
    id_recepcion INT NOT NULL,
    id_contrato INT NOT NULL,
    estado ENUM('Recibida','En inspeccion','Inspeccionada','Despachada') NOT NULL DEFAULT 'Recibida',
    observaciones TEXT NULL,
    UNIQUE KEY uq_caja_codigo (codigo),
    CONSTRAINT fk_cajas_id_recepcion FOREIGN KEY (id_recepcion) REFERENCES recepciones(id_recepcion),
    CONSTRAINT fk_cajas_id_contrato FOREIGN KEY (id_contrato) REFERENCES contratos_referencia(id_contrato)
) ENGINE=InnoDB;

-- 11. Una caja puede contener varios modelos; cada linea identifica colegio
-- mediante la distribucion de compra.
CREATE TABLE IF NOT EXISTS caja_detalles (
    id_caja_detalle INT AUTO_INCREMENT PRIMARY KEY,
    id_caja INT NOT NULL,
    id_distribucion INT NOT NULL,
    cantidad_recibida INT NOT NULL,
    CONSTRAINT fk_caja_detalles_id_caja FOREIGN KEY (id_caja) REFERENCES cajas(id_caja),
    CONSTRAINT fk_caja_detalles_id_distribucion FOREIGN KEY (id_distribucion) REFERENCES orden_distribuciones(id_distribucion),
    UNIQUE KEY uq_cjd_caja_distribucion (id_caja,id_distribucion)
) ENGINE=InnoDB;

-- 12. Inspeccion general de una caja.
CREATE TABLE IF NOT EXISTS inspecciones (
    id_inspeccion INT AUTO_INCREMENT PRIMARY KEY,
    id_caja INT NOT NULL,
    fecha_inspeccion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resultado ENUM('Conforme','Con incidencias') NOT NULL,
    observaciones TEXT NULL,
    CONSTRAINT fk_inspecciones_id_caja FOREIGN KEY (id_caja) REFERENCES cajas(id_caja),
    UNIQUE KEY uq_inspeccion_caja (id_caja)
) ENGINE=InnoDB;

-- 13. Resultado por modelo contenido en la caja.
CREATE TABLE IF NOT EXISTS inspeccion_detalles (
    id_inspeccion_detalle INT AUTO_INCREMENT PRIMARY KEY,
    id_inspeccion INT NOT NULL,
    id_caja_detalle INT NOT NULL,
    cantidad_conforme INT NOT NULL DEFAULT 0,
    cantidad_danada INT NOT NULL DEFAULT 0,
    cantidad_incorrecta INT NOT NULL DEFAULT 0,
    CONSTRAINT fk_inspeccion_detalles_id_inspeccion FOREIGN KEY (id_inspeccion) REFERENCES inspecciones(id_inspeccion),
    CONSTRAINT fk_inspeccion_detalles_id_caja_detalle FOREIGN KEY (id_caja_detalle) REFERENCES caja_detalles(id_caja_detalle),
    UNIQUE KEY uq_ind_inspeccion_linea (id_inspeccion,id_caja_detalle)
) ENGINE=InnoDB;

-- 14. Seguimiento de productos danados/equivocados y su resolucion.
CREATE TABLE IF NOT EXISTS incidencias (
    id_incidencia INT AUTO_INCREMENT PRIMARY KEY,
    id_inspeccion_detalle INT NOT NULL,
    tipo VARCHAR(80) NOT NULL,
    cantidad_afectada INT NOT NULL,
    descripcion TEXT NULL,
    estado ENUM('Pendiente','En seguimiento','Resuelta','Cancelada') NOT NULL DEFAULT 'Pendiente',
    resolucion TEXT NULL,
    fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_resolucion DATETIME NULL,
    CONSTRAINT fk_incidencias_id_inspeccion_detalle FOREIGN KEY (id_inspeccion_detalle) REFERENCES inspeccion_detalles(id_inspeccion_detalle)
) ENGINE=InnoDB;

-- 15. Salida de productos a un colegio/contrato.
CREATE TABLE IF NOT EXISTS despachos (
    id_despacho INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(50) NOT NULL,
    id_contrato INT NOT NULL,
    fecha_despacho DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    responsable VARCHAR(120) NULL,
    observaciones TEXT NULL,
    UNIQUE KEY uq_despacho_codigo (codigo),
    CONSTRAINT fk_despachos_id_contrato FOREIGN KEY (id_contrato) REFERENCES contratos_referencia(id_contrato)
) ENGINE=InnoDB;

-- 16. Productos/cantidades de cada despacho (pueden ser parciales).
CREATE TABLE IF NOT EXISTS despacho_detalles (
    id_despacho_detalle INT AUTO_INCREMENT PRIMARY KEY,
    id_despacho INT NOT NULL,
    id_distribucion INT NOT NULL,
    cantidad_enviada INT NOT NULL,
    CONSTRAINT fk_despacho_detalles_id_despacho FOREIGN KEY (id_despacho) REFERENCES despachos(id_despacho),
    CONSTRAINT fk_despacho_detalles_id_distribucion FOREIGN KEY (id_distribucion) REFERENCES orden_distribuciones(id_distribucion),
    UNIQUE KEY uq_dpd_despacho_dist (id_despacho,id_distribucion)
) ENGINE=InnoDB;

-- 17. Kardex: existencias derivadas de entradas y salidas por distribucion.
CREATE TABLE IF NOT EXISTS movimientos_inventario (
    id_movimiento INT AUTO_INCREMENT PRIMARY KEY,
    id_distribucion INT NOT NULL,
    tipo ENUM('Entrada','Salida','Ajuste_Entrada','Ajuste_Salida') NOT NULL,
    cantidad INT NOT NULL,
    fecha_movimiento DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    id_caja_detalle INT NULL,
    id_despacho_detalle INT NULL,
    descripcion VARCHAR(255) NULL,
    CONSTRAINT fk_movimientos_inventario_id_distribucion FOREIGN KEY (id_distribucion) REFERENCES orden_distribuciones(id_distribucion),
    CONSTRAINT fk_movimientos_inventario_id_caja_detalle FOREIGN KEY (id_caja_detalle) REFERENCES caja_detalles(id_caja_detalle),
    CONSTRAINT fk_movimientos_inventario_id_despacho_detalle FOREIGN KEY (id_despacho_detalle) REFERENCES despacho_detalles(id_despacho_detalle),
    INDEX idx_mov_distribucion (id_distribucion)
) ENGINE=InnoDB;
USE bd_ishume;

INSERT INTO proveedores (razon_social, estado)
VALUES
('LALO', 'Activo'),
('Joselito', 'Activo'),
('LíderBook', 'Activo');
-- IMPORTANTE: validaciones a implementar en Node.js/PHP dentro de transacciones:
-- 1. orden_detalles.id_producto = contrato_detalles.id_producto en cada distribucion.
-- 2. SUM(distribuciones.cantidad_asignada) = orden_detalles.cantidad_pedida.
-- 3. No asignar mas unidades de las requeridas por contrato, salvo autorizacion.
-- 4. Cada caja debe corresponder al mismo contrato y orden de sus caja_detalles.
-- 5. Inspeccion_detalles deben pertenecer a la caja de su inspeccion.
-- 6. Conforme + danada + incorrecta = cantidad_recibida de cada caja_detalle.
-- 6b. Validar cantidades positivas y precios no negativos desde la aplicacion.
-- 7. Solo lo conforme genera entradas de Kardex, una sola vez.
-- 8. Despachos solo de stock disponible y del mismo contrato.
-- 9. Pagos solo de ordenes con precio confirmado y sin exceder monto permitido.
-- 10. No duplicar movimientos al repetir solicitudes HTTP.
-- 11. Validar manualmente productos aptos para cada proveedor (sin catalogo proveedor-producto).

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
  importe_acordado DECIMAL(12,2) NULL,
  fecha_documento DATE NULL,
  archivo_clave VARCHAR(100) NULL,
  archivo_nombre VARCHAR(255) NULL,
  archivo_mime VARCHAR(50) NULL,
  documento_revision INT UNSIGNED NOT NULL DEFAULT 0,
  documento_operacion CHAR(36) NULL,
  documento_huella CHAR(64) NULL,
  UNIQUE KEY uq_sc_documento_operacion (documento_operacion),
  UNIQUE KEY uq_sc_archivo (archivo_clave),
  CONSTRAINT ck_sc_importe CHECK (importe_acordado IS NULL OR importe_acordado > 0),
  PRIMARY KEY (id_solicitud),
  UNIQUE KEY uq_sc_codigo (codigo),
  UNIQUE KEY uq_sc_operacion (clave_operacion),
  CONSTRAINT fk_sc_proveedor FOREIGN KEY (id_proveedor) REFERENCES proveedores (id_proveedor)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE pagos_proveedor (
  id_pago INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  id_solicitud INT NOT NULL,
  fecha_pago DATE NOT NULL,
  monto DECIMAL(12,2) NOT NULL,
  metodo_pago VARCHAR(50) NOT NULL,
  numero_operacion VARCHAR(100) NULL,
  observaciones TEXT NULL,
  clave_operacion CHAR(36) NULL,
  huella CHAR(64) NULL,
  UNIQUE KEY uq_pago_operacion (clave_operacion),
  CONSTRAINT fk_pago_solicitud FOREIGN KEY (id_solicitud) REFERENCES solicitudes_cotizacion(id_solicitud),
  CONSTRAINT ck_pago_positivo CHECK (monto > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE solicitud_ordenes (
  id_solicitud INT NOT NULL,
  id_orden INT NOT NULL,
  PRIMARY KEY (id_solicitud, id_orden),
  UNIQUE KEY uq_so_orden (id_orden),
  CONSTRAINT fk_so_solicitud FOREIGN KEY (id_solicitud) REFERENCES solicitudes_cotizacion (id_solicitud),
  CONSTRAINT fk_so_orden FOREIGN KEY (id_orden) REFERENCES ordenes_compra (id_orden)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


INSERT INTO proveedores (razon_social,estado) SELECT 'LALO','Activo' WHERE NOT EXISTS (SELECT 1 FROM proveedores WHERE razon_social='LALO');
INSERT INTO proveedores (razon_social,estado) SELECT 'Joselito','Activo' WHERE NOT EXISTS (SELECT 1 FROM proveedores WHERE razon_social='Joselito');
INSERT INTO proveedores (razon_social,estado) SELECT 'LíderBook','Activo' WHERE NOT EXISTS (SELECT 1 FROM proveedores WHERE razon_social='LíderBook');
