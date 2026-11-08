-- ISHUME | Sistema de Gestion y Control de Compras e Inventario
-- MySQL 8.0+ / MariaDB compatible (XAMPP)
-- 20 tablas: 19 originales y auditoria de correcciones de abonos.
-- INSTALACION NUEVA EN BASE VACIA. No ejecutar sobre datos existentes.
-- Incluye los cambios de las migraciones 001, 003, 004, 005, 006, 007, 008 y 009.
-- No requiere ejecutarlas por separado en una instalacion nueva.
-- No elimina bases, tablas ni registros.
-- Motor InnoDB y restricciones CONSTRAINT explicitas para las claves foraneas.
-- Ejecutar en MySQL Workbench (instalacion nueva).
-- Nota: la aplicacion debe validar que los productos de cada orden corresponden
-- al proveedor, y que contratos/distribuciones/cajas/despachos son consistentes.

CREATE DATABASE IF NOT EXISTS bd_ishume CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE bd_ishume;
SET time_zone = '-05:00';


-- 1. Proveedores: una orden pertenece a un solo proveedor.
CREATE TABLE IF NOT EXISTS proveedores (
    id_proveedor INT AUTO_INCREMENT PRIMARY KEY,
    razon_social VARCHAR(200) NOT NULL,
    ruc VARCHAR(20) NULL,
    telefono VARCHAR(30) NULL,
    correo VARCHAR(150) NULL,
    direccion VARCHAR(255) NULL,
    especialidad VARCHAR(150) NULL,
    estado ENUM('Activo','Inactivo') NOT NULL DEFAULT 'Activo',
    prefijo_orden_masiva VARCHAR(8) NULL,
    ultimo_orden_masiva BIGINT UNSIGNED NOT NULL DEFAULT 0,
    UNIQUE KEY uq_proveedor_ruc (ruc),
    UNIQUE KEY uq_proveedor_prefijo_masivo (prefijo_orden_masiva)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Detalles solicitados por cada contrato.
CREATE TABLE IF NOT EXISTS contrato_detalles (
    id_detalle_contrato INT AUTO_INCREMENT PRIMARY KEY,
    id_contrato INT NOT NULL,
    id_producto INT NOT NULL,
    cantidad_requerida INT NOT NULL,
    CONSTRAINT fk_contrato_detalles_id_contrato FOREIGN KEY (id_contrato) REFERENCES contratos_referencia(id_contrato),
    CONSTRAINT fk_contrato_detalles_id_producto FOREIGN KEY (id_producto) REFERENCES productos(id_producto),
    INDEX idx_cd_contrato (id_contrato)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Pedidos internos por proveedor (ordenes masivas en solicitudes_cotizacion).
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Tabla clave: reparte cada linea entre varios contratos/colegios.
CREATE TABLE IF NOT EXISTS orden_distribuciones (
    id_distribucion INT AUTO_INCREMENT PRIMARY KEY,
    id_orden_detalle INT NOT NULL,
    id_detalle_contrato INT NOT NULL,
    cantidad_asignada INT NOT NULL,
    CONSTRAINT fk_orden_distribuciones_id_orden_detalle FOREIGN KEY (id_orden_detalle) REFERENCES orden_detalles(id_orden_detalle),
    CONSTRAINT fk_orden_distribuciones_id_detalle_contrato FOREIGN KEY (id_detalle_contrato) REFERENCES contrato_detalles(id_detalle_contrato),
    UNIQUE KEY uq_dist_linea_contrato (id_orden_detalle,id_detalle_contrato)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. Ordenes de compra masivas y documento del proveedor (importe, archivo y registro).
CREATE TABLE IF NOT EXISTS solicitudes_cotizacion (
    id_solicitud INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(30) NOT NULL,
    id_proveedor INT NOT NULL,
    fecha_emision DATE NOT NULL,
    estado ENUM('Generada','Enviada','Cotizada','Confirmada','Cancelada') NOT NULL DEFAULT 'Generada',
    clave_operacion CHAR(36) NOT NULL,
    huella CHAR(64) NOT NULL,
    contenido_json JSON NOT NULL,
    importe_acordado DECIMAL(12,2) NULL,
    archivo_clave VARCHAR(100) NULL,
    archivo_nombre VARCHAR(255) NULL,
    archivo_mime VARCHAR(50) NULL,
    fecha_registro_documento DATETIME NULL COMMENT 'Fecha y hora de registro en America/Lima',
    documento_revision INT UNSIGNED NOT NULL DEFAULT 0,
    documento_operacion CHAR(36) NULL,
    documento_huella CHAR(64) NULL,
    CONSTRAINT fk_solicitudes_cotizacion_id_proveedor FOREIGN KEY (id_proveedor) REFERENCES proveedores(id_proveedor),
    CONSTRAINT ck_sc_importe CHECK (importe_acordado IS NULL OR importe_acordado > 0),
    UNIQUE KEY uq_sc_codigo (codigo),
    UNIQUE KEY uq_sc_operacion (clave_operacion),
    UNIQUE KEY uq_sc_archivo (archivo_clave),
    UNIQUE KEY uq_sc_documento_operacion (documento_operacion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. Relacion entre las ordenes masivas y los pedidos internos.
CREATE TABLE IF NOT EXISTS solicitud_ordenes (
    id_solicitud INT NOT NULL,
    id_orden INT NOT NULL,
    PRIMARY KEY (id_solicitud, id_orden),
    CONSTRAINT fk_solicitud_ordenes_id_solicitud FOREIGN KEY (id_solicitud) REFERENCES solicitudes_cotizacion(id_solicitud),
    CONSTRAINT fk_solicitud_ordenes_id_orden FOREIGN KEY (id_orden) REFERENCES ordenes_compra(id_orden),
    UNIQUE KEY uq_so_orden (id_orden)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. Abonos al proveedor asociados a la orden masiva (saldo calculado).
-- Sin campo observaciones. El motivo pertenece a la auditoria de correcciones.
CREATE TABLE IF NOT EXISTS pagos_proveedor (
    id_pago INT AUTO_INCREMENT PRIMARY KEY,
    id_solicitud INT NOT NULL,
    fecha_pago DATE NOT NULL,
    fecha_registro DATETIME NULL COMMENT 'Registro automatico en America/Lima, NULL para pagos anteriores',
    monto DECIMAL(12,2) NOT NULL,
    metodo_pago VARCHAR(50) NOT NULL,
    numero_operacion VARCHAR(100) NULL,
    clave_operacion CHAR(36) NULL,
    huella CHAR(64) NULL,
    CONSTRAINT fk_pago_solicitud FOREIGN KEY (id_solicitud) REFERENCES solicitudes_cotizacion(id_solicitud),
    CONSTRAINT ck_pago_positivo CHECK (monto > 0),
    UNIQUE KEY uq_pago_operacion (clave_operacion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. Historial acumulativo de correcciones de abonos.
-- observacion_anterior/nueva se conservan por compatibilidad historica; el modulo no las utiliza.
CREATE TABLE IF NOT EXISTS correcciones_pago_proveedor (
  id_correccion INT NOT NULL AUTO_INCREMENT,
  id_pago INT NOT NULL,
  monto_anterior DECIMAL(12,2) NOT NULL,
  monto_nuevo DECIMAL(12,2) NOT NULL,
  metodo_anterior VARCHAR(50) NOT NULL,
  metodo_nuevo VARCHAR(50) NOT NULL,
  fecha_pago_anterior DATE NULL,
  fecha_pago_nueva DATE NULL,
  observacion_anterior TEXT NULL,
  observacion_nueva TEXT NULL,
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
  CONSTRAINT ck_correccion_cambio_completo CHECK (monto_anterior <> monto_nuevo OR metodo_anterior <> metodo_nuevo
    OR NOT(fecha_pago_anterior <=> fecha_pago_nueva) OR NOT(observacion_anterior <=> observacion_nueva))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. Recepciones parciales de una orden.
CREATE TABLE IF NOT EXISTS recepciones (
    id_recepcion INT AUTO_INCREMENT PRIMARY KEY,
    id_orden INT NOT NULL,
    fecha_recepcion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    responsable VARCHAR(120) NULL,
    observaciones TEXT NULL,
    CONSTRAINT fk_recepciones_id_orden FOREIGN KEY (id_orden) REFERENCES ordenes_compra(id_orden)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 13. Caja: pertenece a una recepcion y a UN contrato/colegio.
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 14. Una caja puede contener varios modelos; cada linea identifica colegio
-- mediante la distribucion de compra.
CREATE TABLE IF NOT EXISTS caja_detalles (
    id_caja_detalle INT AUTO_INCREMENT PRIMARY KEY,
    id_caja INT NOT NULL,
    id_distribucion INT NOT NULL,
    cantidad_recibida INT NOT NULL,
    CONSTRAINT fk_caja_detalles_id_caja FOREIGN KEY (id_caja) REFERENCES cajas(id_caja),
    CONSTRAINT fk_caja_detalles_id_distribucion FOREIGN KEY (id_distribucion) REFERENCES orden_distribuciones(id_distribucion),
    UNIQUE KEY uq_cjd_caja_distribucion (id_caja,id_distribucion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 15. Inspeccion general de una caja.
CREATE TABLE IF NOT EXISTS inspecciones (
    id_inspeccion INT AUTO_INCREMENT PRIMARY KEY,
    id_caja INT NOT NULL,
    fecha_inspeccion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resultado ENUM('Conforme','Con incidencias') NOT NULL,
    observaciones TEXT NULL,
    CONSTRAINT fk_inspecciones_id_caja FOREIGN KEY (id_caja) REFERENCES cajas(id_caja),
    UNIQUE KEY uq_inspeccion_caja (id_caja)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 16. Resultado por modelo contenido en la caja.
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 17. Seguimiento de productos danados/equivocados y su resolucion.
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 18. Salida de productos a un colegio/contrato.
CREATE TABLE IF NOT EXISTS despachos (
    id_despacho INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(50) NOT NULL,
    id_contrato INT NOT NULL,
    fecha_despacho DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    responsable VARCHAR(120) NULL,
    observaciones TEXT NULL,
    UNIQUE KEY uq_despacho_codigo (codigo),
    CONSTRAINT fk_despachos_id_contrato FOREIGN KEY (id_contrato) REFERENCES contratos_referencia(id_contrato)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 19. Productos/cantidades de cada despacho (pueden ser parciales).
CREATE TABLE IF NOT EXISTS despacho_detalles (
    id_despacho_detalle INT AUTO_INCREMENT PRIMARY KEY,
    id_despacho INT NOT NULL,
    id_distribucion INT NOT NULL,
    cantidad_enviada INT NOT NULL,
    CONSTRAINT fk_despacho_detalles_id_despacho FOREIGN KEY (id_despacho) REFERENCES despachos(id_despacho),
    CONSTRAINT fk_despacho_detalles_id_distribucion FOREIGN KEY (id_distribucion) REFERENCES orden_distribuciones(id_distribucion),
    UNIQUE KEY uq_dpd_despacho_dist (id_despacho,id_distribucion)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 20. Kardex: existencias derivadas de entradas y salidas por distribucion.
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Proveedores iniciales. Los IDs se generan automaticamente.
INSERT INTO proveedores (razon_social, estado)
SELECT 'LALO', 'Activo' WHERE NOT EXISTS (SELECT 1 FROM proveedores WHERE razon_social='LALO');
INSERT INTO proveedores (razon_social, estado)
SELECT 'Joselito', 'Activo' WHERE NOT EXISTS (SELECT 1 FROM proveedores WHERE razon_social='Joselito');
INSERT INTO proveedores (razon_social, estado)
SELECT 'LíderBook', 'Activo' WHERE NOT EXISTS (SELECT 1 FROM proveedores WHERE razon_social='LíderBook');

SHOW TABLES;
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
