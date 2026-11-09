-- 25 tablas: 11 de Compras, 4 catalogos independientes y 10 para etapas posteriores.
-- Esquema completo propuesto; las funcionalidades futuras aun requieren backend.
-- Ejecutar solo en base vacia. No aplicar junto con los otros scripts completos.
-- DB_NAME debe apuntar a ishume_unificada al utilizar esta instalacion.
-- ISHUME | ESQUEMA UNIFICADO DE DESARROLLO
-- MySQL 8.0.16+ / MariaDB con CHECK y JSON.
-- Ejecutar en una BASE NUEVA. No migra ni borra datos de bases anteriores.
-- Convencion: identificadores INT UNSIGNED, InnoDB, utf8mb4_unicode_ci.
-- Compras conserva productos; el catalogo independiente conserva inventario_productos.
-- NOTA: la asignacion contractual no equivale a clasificacion fisica.

CREATE DATABASE IF NOT EXISTS ishume_unificada
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE ishume_unificada;
SET time_zone = '-05:00';

-- 01. Catalogos (se preservan columnas del modulo Inventario).
CREATE TABLE categorias (
  id_categoria INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre_categoria VARCHAR(30) NOT NULL,
  estado TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT uq_categorias_nombre UNIQUE (nombre_categoria)
) ENGINE=InnoDB;

-- 02
CREATE TABLE disenios (
  id_diseno INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_categoria INT UNSIGNED NOT NULL,
  nombre_diseno VARCHAR(30) NOT NULL,
  descripcion VARCHAR(255) NULL,
  estado TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_disenios_categoria FOREIGN KEY (id_categoria)
    REFERENCES categorias(id_categoria) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- 03. Se agrega id_modelo_api para relacionar los modelos importados de la API.
-- NULL para modelos creados solo en ISHUME; UNIQUE permite varios NULL.
CREATE TABLE modelos (
  id_modelo INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_diseno INT UNSIGNED NOT NULL,
  id_modelo_api INT NULL,
  nombre_modelo VARCHAR(30) NOT NULL,
  nivel_educativo VARCHAR(30) NULL,
  estado TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT uq_modelos_api UNIQUE (id_modelo_api),
  CONSTRAINT fk_modelos_diseno FOREIGN KEY (id_diseno)
    REFERENCES disenios(id_diseno) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- 04. Catalogo independiente de Inventario; no sustituye productos de Compras.
CREATE TABLE inventario_productos (
  id_producto INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_modelo INT UNSIGNED NOT NULL,
  sku VARCHAR(30) NOT NULL,
  precio DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  stock_actual INT UNSIGNED NOT NULL DEFAULT 0,
  estado TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT uq_productos_sku UNIQUE (sku),
  CONSTRAINT chk_productos_precio CHECK (precio >= 0),
  CONSTRAINT fk_productos_modelo FOREIGN KEY (id_modelo)
    REFERENCES modelos(id_modelo) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- Modelos de la API utilizados por Compras (sin SKU ni stock).
CREATE TABLE productos (
    id_producto INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_modelo_api INT NULL,
    nombre VARCHAR(180) NOT NULL,
    tipo VARCHAR(100) NULL,
    categoria VARCHAR(100) NULL,
    nivel_educativo VARCHAR(100) NULL,
    activo TINYINT(1) NOT NULL DEFAULT 1,
    UNIQUE KEY uq_producto_modelo_api (id_modelo_api)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 05. Proveedores: esquema funcional del modulo Compras.
CREATE TABLE proveedores (
  id_proveedor INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  razon_social VARCHAR(200) NOT NULL,
  ruc VARCHAR(20) NULL,
  telefono VARCHAR(30) NULL,
  correo VARCHAR(150) NULL,
  direccion VARCHAR(255) NULL,
  especialidad VARCHAR(150) NULL,
  estado ENUM('Activo','Inactivo') NOT NULL DEFAULT 'Activo',
  prefijo_orden_masiva VARCHAR(8) NULL,
  ultimo_orden_masiva BIGINT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT uq_proveedor_ruc UNIQUE (ruc),
  CONSTRAINT uq_proveedor_prefijo_masivo UNIQUE (prefijo_orden_masiva)
) ENGINE=InnoDB;

-- 06. Contratos locales de API o excepciones manuales.
CREATE TABLE contratos_referencia (
  id_contrato INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_contrato_api INT NULL,
  origen ENUM('API','MANUAL') NOT NULL DEFAULT 'API',
  cliente_colegio VARCHAR(250) NOT NULL,
  fecha_entrega DATE NULL,
  fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  observaciones TEXT NULL,
  CONSTRAINT uq_contrato_api UNIQUE (id_contrato_api)
) ENGINE=InnoDB;

-- 07. Detalles contractuales vinculados a productos de Compras.
CREATE TABLE contrato_detalles (
  id_detalle_contrato INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_contrato INT UNSIGNED NOT NULL,
  id_producto INT UNSIGNED NOT NULL,
  cantidad_requerida INT UNSIGNED NOT NULL,
  CONSTRAINT chk_cd_cantidad CHECK (cantidad_requerida > 0),
  CONSTRAINT fk_cd_contrato FOREIGN KEY (id_contrato)
    REFERENCES contratos_referencia(id_contrato) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_cd_producto FOREIGN KEY (id_producto)
    REFERENCES productos(id_producto) ON UPDATE CASCADE ON DELETE RESTRICT,
  INDEX idx_cd_contrato (id_contrato)
) ENGINE=InnoDB;

-- 08. Ordenes internas por proveedor (Compras).
CREATE TABLE ordenes_compra (
  id_orden INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo VARCHAR(30) NOT NULL,
  id_proveedor INT UNSIGNED NOT NULL,
  fecha_emision DATE NOT NULL,
  estado ENUM('Borrador','Enviada','Cotizada','Confirmada','Cancelada') NOT NULL DEFAULT 'Borrador',
  cotizacion_archivo VARCHAR(255) NULL,
  fecha_cotizacion DATE NULL,
  tipo_comprobante VARCHAR(40) NULL,
  numero_comprobante VARCHAR(60) NULL,
  observaciones TEXT NULL,
  fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_orden_codigo UNIQUE (codigo),
  CONSTRAINT fk_oc_proveedor FOREIGN KEY (id_proveedor)
    REFERENCES proveedores(id_proveedor) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- 09. Lineas consolidadas por producto/modelo de Compras.
CREATE TABLE orden_detalles (
  id_orden_detalle INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_orden INT UNSIGNED NOT NULL,
  id_producto INT UNSIGNED NOT NULL,
  cantidad_pedida INT UNSIGNED NOT NULL,
  precio_unitario DECIMAL(12,2) NULL,
  CONSTRAINT chk_od_cantidad CHECK (cantidad_pedida > 0),
  CONSTRAINT chk_od_precio CHECK (precio_unitario IS NULL OR precio_unitario >= 0),
  CONSTRAINT uq_od_orden_producto UNIQUE (id_orden,id_producto),
  CONSTRAINT fk_od_orden FOREIGN KEY (id_orden)
    REFERENCES ordenes_compra(id_orden) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_od_producto FOREIGN KEY (id_producto)
    REFERENCES productos(id_producto) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- 10. Asignacion DOCUMENTAL de una linea de compra a cada contrato.
CREATE TABLE orden_distribuciones (
  id_distribucion INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_orden_detalle INT UNSIGNED NOT NULL,
  id_detalle_contrato INT UNSIGNED NOT NULL,
  cantidad_asignada INT UNSIGNED NOT NULL,
  CONSTRAINT chk_dist_cantidad CHECK (cantidad_asignada > 0),
  CONSTRAINT uq_dist_linea_contrato UNIQUE (id_orden_detalle,id_detalle_contrato),
  CONSTRAINT fk_dist_orden_detalle FOREIGN KEY (id_orden_detalle)
    REFERENCES orden_detalles(id_orden_detalle) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_dist_contrato_detalle FOREIGN KEY (id_detalle_contrato)
    REFERENCES contrato_detalles(id_detalle_contrato) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- 11. Ordenes masivas/cotizaciones: campos originales de Compras.
CREATE TABLE solicitudes_cotizacion (
  id_solicitud INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo VARCHAR(30) NOT NULL,
  id_proveedor INT UNSIGNED NOT NULL,
  fecha_emision DATE NOT NULL,
  estado ENUM('Generada','Enviada','Cotizada','Confirmada','Cancelada') NOT NULL DEFAULT 'Generada',
  clave_operacion CHAR(36) NOT NULL,
  huella CHAR(64) NOT NULL,
  contenido_json JSON NOT NULL,
  importe_acordado DECIMAL(12,2) NULL,
  archivo_clave VARCHAR(100) NULL,
  archivo_nombre VARCHAR(255) NULL,
  archivo_mime VARCHAR(50) NULL,
  fecha_registro_documento DATETIME NULL COMMENT 'America/Lima asignada por backend',
  documento_revision INT UNSIGNED NOT NULL DEFAULT 0,
  documento_operacion CHAR(36) NULL,
  documento_huella CHAR(64) NULL,
  CONSTRAINT ck_sc_importe CHECK (importe_acordado IS NULL OR importe_acordado > 0),
  CONSTRAINT uq_sc_codigo UNIQUE (codigo),
  CONSTRAINT uq_sc_operacion UNIQUE (clave_operacion),
  CONSTRAINT uq_sc_archivo UNIQUE (archivo_clave),
  CONSTRAINT uq_sc_documento_operacion UNIQUE (documento_operacion),
  CONSTRAINT fk_sc_proveedor FOREIGN KEY (id_proveedor)
    REFERENCES proveedores(id_proveedor) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- 12. Una orden interna pertenece como maximo a una solicitud masiva.
CREATE TABLE solicitud_ordenes (
  id_solicitud INT UNSIGNED NOT NULL,
  id_orden INT UNSIGNED NOT NULL,
  PRIMARY KEY (id_solicitud,id_orden),
  CONSTRAINT uq_so_orden UNIQUE (id_orden),
  CONSTRAINT fk_so_solicitud FOREIGN KEY (id_solicitud)
    REFERENCES solicitudes_cotizacion(id_solicitud) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_so_orden FOREIGN KEY (id_orden)
    REFERENCES ordenes_compra(id_orden) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- 13. Abonos parciales, saldo calculado por consultas.
CREATE TABLE pagos_proveedor (
  id_pago INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_solicitud INT UNSIGNED NOT NULL,
  fecha_pago DATE NOT NULL,
  fecha_registro DATETIME NULL COMMENT 'America/Lima asignada por backend',
  monto DECIMAL(12,2) NOT NULL,
  metodo_pago VARCHAR(50) NOT NULL,
  numero_operacion VARCHAR(100) NULL,
  clave_operacion CHAR(36) NULL,
  huella CHAR(64) NULL,
  CONSTRAINT ck_pago_positivo CHECK (monto > 0),
  CONSTRAINT uq_pago_operacion UNIQUE (clave_operacion),
  CONSTRAINT fk_pago_solicitud FOREIGN KEY (id_solicitud)
    REFERENCES solicitudes_cotizacion(id_solicitud) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- 14. Auditoria de correcciones de pagos: esquema conservado.
CREATE TABLE correcciones_pago_proveedor (
  id_correccion INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_pago INT UNSIGNED NOT NULL,
  monto_anterior DECIMAL(12,2) NOT NULL,
  monto_nuevo DECIMAL(12,2) NOT NULL,
  metodo_anterior VARCHAR(50) NOT NULL,
  metodo_nuevo VARCHAR(50) NOT NULL,
  fecha_pago_anterior DATE NULL,
  fecha_pago_nueva DATE NULL,
  observacion_anterior TEXT NULL,
  observacion_nueva TEXT NULL,
  motivo VARCHAR(500) NOT NULL,
  fecha_correccion DATETIME NOT NULL COMMENT 'America/Lima asignada por backend',
  responsable_identificador VARCHAR(191) NULL,
  clave_operacion CHAR(36) NOT NULL,
  huella CHAR(64) NOT NULL,
  CONSTRAINT uq_correccion_operacion UNIQUE (clave_operacion),
  INDEX idx_correccion_pago (id_pago,id_correccion),
  CONSTRAINT fk_correccion_pago FOREIGN KEY (id_pago)
    REFERENCES pagos_proveedor(id_pago) ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT ck_correccion_montos CHECK (monto_anterior > 0 AND monto_nuevo > 0),
  CONSTRAINT ck_correccion_motivo CHECK (CHAR_LENGTH(TRIM(motivo)) > 0),
  CONSTRAINT ck_correccion_metodo CHECK (metodo_nuevo IN ('Yape','Transferencia')),
  CONSTRAINT ck_correccion_cambio_completo CHECK (
    monto_anterior <> monto_nuevo OR metodo_anterior <> metodo_nuevo
    OR NOT (fecha_pago_anterior <=> fecha_pago_nueva)
    OR NOT (observacion_anterior <=> observacion_nueva)
  )
) ENGINE=InnoDB;

-- 15. Recepciones: lote real mezclado, ligado a orden interna por proveedor.
-- No obliga a asignar fisicamente cajas a colegios al momento de recibir.
CREATE TABLE recepciones (
  id_recepcion INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_orden INT UNSIGNED NOT NULL,
  codigo_lote VARCHAR(50) NOT NULL,
  fecha_recepcion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  responsable VARCHAR(120) NULL,
  estado ENUM('Pendiente','Inspeccionada','Cerrada') NOT NULL DEFAULT 'Pendiente',
  observaciones TEXT NULL,
  CONSTRAINT uq_recepcion_lote UNIQUE (codigo_lote),
  CONSTRAINT fk_recepcion_orden FOREIGN KEY (id_orden)
    REFERENCES ordenes_compra(id_orden) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- 16. Cantidades por producto dentro de cada lote, incluidas incidencias.
CREATE TABLE recepcion_detalles (
  id_recepcion_detalle INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_recepcion INT UNSIGNED NOT NULL,
  id_orden_detalle INT UNSIGNED NOT NULL,
  cantidad_recibida INT UNSIGNED NOT NULL DEFAULT 0,
  cantidad_conforme INT UNSIGNED NOT NULL DEFAULT 0,
  cantidad_danada INT UNSIGNED NOT NULL DEFAULT 0,
  cantidad_incorrecta INT UNSIGNED NOT NULL DEFAULT 0,
  observaciones TEXT NULL,
  CONSTRAINT uq_rd_recepcion_linea UNIQUE (id_recepcion,id_orden_detalle),
  CONSTRAINT ck_rd_cantidades CHECK (
    cantidad_conforme + cantidad_danada + cantidad_incorrecta <= cantidad_recibida
  ),
  CONSTRAINT fk_rd_recepcion FOREIGN KEY (id_recepcion)
    REFERENCES recepciones(id_recepcion) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_rd_orden_detalle FOREIGN KEY (id_orden_detalle)
    REFERENCES orden_detalles(id_orden_detalle) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- 17. Clasificacion FISICA posterior: cuantas unidades conformes de un lote
-- se separaron para un contrato concreto. Puede hacerse por etapas.
CREATE TABLE recepcion_asignaciones (
  id_asignacion INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_recepcion_detalle INT UNSIGNED NOT NULL,
  id_distribucion INT UNSIGNED NOT NULL,
  cantidad_clasificada INT UNSIGNED NOT NULL,
  fecha_clasificacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  observaciones VARCHAR(255) NULL,
  CONSTRAINT ck_ra_cantidad CHECK (cantidad_clasificada > 0),
  CONSTRAINT fk_ra_recepcion_detalle FOREIGN KEY (id_recepcion_detalle)
    REFERENCES recepcion_detalles(id_recepcion_detalle) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_ra_distribucion FOREIGN KEY (id_distribucion)
    REFERENCES orden_distribuciones(id_distribucion) ON UPDATE CASCADE ON DELETE RESTRICT,
  INDEX idx_ra_distribucion (id_distribucion)
) ENGINE=InnoDB;

-- 18. Incidencias al recibir: faltantes, danos o producto incorrecto.
CREATE TABLE incidencias (
  id_incidencia INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_recepcion_detalle INT UNSIGNED NOT NULL,
  tipo VARCHAR(80) NOT NULL,
  cantidad_afectada INT UNSIGNED NOT NULL,
  descripcion TEXT NULL,
  estado ENUM('Pendiente','En seguimiento','Resuelta','Cancelada') NOT NULL DEFAULT 'Pendiente',
  resolucion TEXT NULL,
  fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_resolucion DATETIME NULL,
  CONSTRAINT ck_incidencia_cantidad CHECK (cantidad_afectada > 0),
  CONSTRAINT fk_incidencia_rd FOREIGN KEY (id_recepcion_detalle)
    REFERENCES recepcion_detalles(id_recepcion_detalle) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- 19. Reposiciones de proveedor: historico; ingreso fisico debe registrarse
-- como nueva recepcion, sin duplicar stock por esta tabla.
CREATE TABLE incidencia_reposiciones (
  id_reposicion INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_incidencia INT UNSIGNED NOT NULL,
  id_recepcion_detalle INT UNSIGNED NULL,
  cantidad_repuesta INT UNSIGNED NOT NULL,
  fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT ck_reposicion_cantidad CHECK (cantidad_repuesta > 0),
  CONSTRAINT fk_reposicion_incidencia FOREIGN KEY (id_incidencia)
    REFERENCES incidencias(id_incidencia) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_reposicion_rd FOREIGN KEY (id_recepcion_detalle)
    REFERENCES recepcion_detalles(id_recepcion_detalle) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- 20. Cabecera de preparacion por contrato (armado tras editar fotos).
CREATE TABLE preparaciones (
  id_preparacion INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_contrato INT UNSIGNED NOT NULL,
  fecha_inicio DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  estado ENUM('Pendiente','En proceso','Terminada') NOT NULL DEFAULT 'Pendiente',
  observaciones TEXT NULL,
  CONSTRAINT uq_preparacion_contrato UNIQUE (id_contrato),
  CONSTRAINT fk_preparacion_contrato FOREIGN KEY (id_contrato)
    REFERENCES contratos_referencia(id_contrato) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- 21. Avances parciales de armado por detalle del contrato.
CREATE TABLE preparacion_detalles (
  id_preparacion_detalle INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_preparacion INT UNSIGNED NOT NULL,
  id_detalle_contrato INT UNSIGNED NOT NULL,
  cantidad_preparada INT UNSIGNED NOT NULL,
  fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  codigo_caja VARCHAR(50) NULL,
  observaciones TEXT NULL,
  CONSTRAINT ck_pd_cantidad CHECK (cantidad_preparada > 0),
  CONSTRAINT fk_pd_preparacion FOREIGN KEY (id_preparacion)
    REFERENCES preparaciones(id_preparacion) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_pd_contrato_detalle FOREIGN KEY (id_detalle_contrato)
    REFERENCES contrato_detalles(id_detalle_contrato) ON UPDATE CASCADE ON DELETE RESTRICT,
  INDEX idx_pd_contrato_detalle (id_detalle_contrato)
) ENGINE=InnoDB;

-- 22. Despacho completo por contrato; se confirma una sola vez.
CREATE TABLE despachos (
  id_despacho INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo VARCHAR(50) NOT NULL,
  id_contrato INT UNSIGNED NOT NULL,
  fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_despacho DATETIME NULL,
  estado ENUM('Pendiente','Confirmado','Cancelado') NOT NULL DEFAULT 'Pendiente',
  responsable VARCHAR(120) NULL,
  observaciones TEXT NULL,
  CONSTRAINT uq_despacho_codigo UNIQUE (codigo),
  CONSTRAINT uq_despacho_contrato UNIQUE (id_contrato),
  CONSTRAINT fk_despacho_contrato FOREIGN KEY (id_contrato)
    REFERENCES contratos_referencia(id_contrato) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- 23. Cantidades confirmadas por linea contractual, sin despacho parcial.
CREATE TABLE despacho_detalles (
  id_despacho_detalle INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_despacho INT UNSIGNED NOT NULL,
  id_detalle_contrato INT UNSIGNED NOT NULL,
  cantidad_final INT UNSIGNED NOT NULL,
  CONSTRAINT uq_dd_linea UNIQUE (id_despacho,id_detalle_contrato),
  CONSTRAINT ck_dd_cantidad CHECK (cantidad_final > 0),
  CONSTRAINT fk_dd_despacho FOREIGN KEY (id_despacho)
    REFERENCES despachos(id_despacho) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_dd_contrato_detalle FOREIGN KEY (id_detalle_contrato)
    REFERENCES contrato_detalles(id_detalle_contrato) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- 24. Trazabilidad fisica de entradas y salidas; no confundir con
-- asignacion documental de orden_distribuciones.
CREATE TABLE movimientos_inventario (
  id_movimiento INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_producto INT UNSIGNED NOT NULL,
  id_recepcion_detalle INT UNSIGNED NULL,
  id_despacho_detalle INT UNSIGNED NULL,
  tipo ENUM('Entrada','Salida','Ajuste_Entrada','Ajuste_Salida') NOT NULL,
  cantidad INT UNSIGNED NOT NULL,
  fecha_movimiento DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  descripcion VARCHAR(255) NULL,
  CONSTRAINT ck_mov_cantidad CHECK (cantidad > 0),
  CONSTRAINT ck_mov_origen CHECK (
    id_recepcion_detalle IS NULL OR id_despacho_detalle IS NULL
  ),
  CONSTRAINT fk_mov_producto FOREIGN KEY (id_producto)
    REFERENCES productos(id_producto) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_mov_recepcion FOREIGN KEY (id_recepcion_detalle)
    REFERENCES recepcion_detalles(id_recepcion_detalle) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_mov_despacho FOREIGN KEY (id_despacho_detalle)
    REFERENCES despacho_detalles(id_despacho_detalle) ON UPDATE CASCADE ON DELETE RESTRICT,
  INDEX idx_mov_producto_fecha (id_producto,fecha_movimiento)
) ENGINE=InnoDB;

-- Proveedores de prueba del modulo Compras (sin asumir IDs fijos).
INSERT INTO proveedores (razon_social,estado)
SELECT 'LALO','Activo' WHERE NOT EXISTS
  (SELECT 1 FROM proveedores WHERE razon_social='LALO');
INSERT INTO proveedores (razon_social,estado)
SELECT 'Joselito','Activo' WHERE NOT EXISTS
  (SELECT 1 FROM proveedores WHERE razon_social='Joselito');
INSERT INTO proveedores (razon_social,estado)
SELECT 'LíderBook','Activo' WHERE NOT EXISTS
  (SELECT 1 FROM proveedores WHERE razon_social='LíderBook');

-- REGLAS TRANSACCIONALES A IMPLEMENTAR EN EL BACKEND:
-- A. Compras importa modelos de la API en productos usando id_modelo_api.
--    No equiparar IDs ni sincronizar automaticamente con inventario_productos.
-- B. Cada distribucion debe relacionar EL MISMO producto en orden_detalles
--    y contrato_detalles. Suma de distribuciones = cantidad_pedida al confirmar.
-- C. Cada recepcion_detalle debe pertenecer a la misma orden de su recepcion.
-- D. Cada recepcion_asignacion debe corresponder a la misma linea de compra;
--    suma clasificada <= cantidad conforme del lote y <= cantidad asignada.
-- E. Faltantes se calculan contra cantidad_pedida y recepciones acumuladas;
--    no se registran como entrada fisica.
-- F. Suma de avances preparados <= cantidad_requerida del contrato.
-- G. Confirmar despacho completo exige todas las lineas preparadas,
--    sin duplicar confirmacion. Actualizar stock + movimiento atomico.
-- H. El Kardex operativo usa productos de Compras. Las entradas conformes y
--    salidas se registran una sola vez. El saldo fisico se deriva de movimientos.
--    No actualizar stock_actual del catalogo independiente por igualdad de IDs.
-- I. Usar transacciones, bloqueo de filas y controles de idempotencia.
-- J. No asumir que productos asignados documentalmente ya estan separados.
-- K. Si se permiten ajustes manuales, registrar motivo y autorizacion.
-- L. No usar `precio` del catalogo como costo real de compra; para eso
--    existe orden_detalles.precio_unitario y solicitudes_cotizacion.

SHOW TABLES;
