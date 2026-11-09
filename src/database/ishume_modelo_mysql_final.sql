
CREATE DATABASE IF NOT EXISTS ishume_gestion
  CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE ishume_gestion;

-- ================================================================
-- BLOQUE 1: CATALOGOS Y PROVEEDORES
-- ================================================================

-- 01. Categorias (1:N con disenios)
CREATE TABLE categorias (
  id_categoria INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre_categoria VARCHAR(30) NOT NULL,
  estado TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Activo, 0=Inactivo',
  CONSTRAINT uq_categorias_nombre UNIQUE (nombre_categoria)
) ENGINE=InnoDB;

-- 02. Disenios (N:1 con categorias)
CREATE TABLE disenios (
  id_diseno INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_categoria INT UNSIGNED NOT NULL,
  nombre_diseno VARCHAR(30) NOT NULL,
  descripcion VARCHAR(255) NULL,
  estado TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Activo, 0=Inactivo',
  CONSTRAINT fk_disenios_categoria FOREIGN KEY (id_categoria)
    REFERENCES categorias(id_categoria)
) ENGINE=InnoDB;

-- 03. Modelos (N:1 con disenios)
CREATE TABLE modelos (
  id_modelo INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_diseno INT UNSIGNED NOT NULL,
  nombre_modelo VARCHAR(30) NOT NULL,
  nivel_educativo VARCHAR(30) NULL,
  estado TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Activo, 0=Inactivo',
  CONSTRAINT fk_modelos_diseno FOREIGN KEY (id_diseno)
    REFERENCES disenios(id_diseno)
) ENGINE=InnoDB;

-- 04. Productos de inventario (N:1 con modelos, segun diagrama)
CREATE TABLE inventario_productos (
  id_producto INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_modelo INT UNSIGNED NOT NULL,
  sku VARCHAR(30) NOT NULL,
  precio DECIMAL(5,2) NOT NULL DEFAULT 0.00 COMMENT 'Precio de referencia de venta, no costo real de compra',
  stock_actual INT UNSIGNED NOT NULL DEFAULT 0,
  estado TINYINT(1) NOT NULL DEFAULT 1 COMMENT '1=Activo, 0=Inactivo',
  CONSTRAINT uq_productos_sku UNIQUE (sku),
  CONSTRAINT chk_productos_precio CHECK (precio >= 0),
  CONSTRAINT fk_productos_modelo FOREIGN KEY (id_modelo)
    REFERENCES modelos(id_modelo)
) ENGINE=InnoDB;

-- 05. Proveedores (1:N con orden_compras)
CREATE TABLE proveedores (
  id_proveedor INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  razon_social VARCHAR(100) NOT NULL,
  ruc CHAR(11) NOT NULL,
  direccion VARCHAR(100) NULL,
  email VARCHAR(100) NOT NULL,
  telefono VARCHAR(15) NOT NULL,
  estado VARCHAR(10) NOT NULL DEFAULT 'ACTIVO',
  CONSTRAINT uq_proveedores_ruc UNIQUE (ruc)
) ENGINE=InnoDB;

-- ================================================================
-- BLOQUE 2: CONTRATOS LOCALES Y SU HISTORIAL
-- ================================================================

-- 06. Contratos consultados de la API externa
CREATE TABLE contratos_local (
  id_contrato INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_contrato_externo INT UNSIGNED NOT NULL,
  cliente_colegio VARCHAR(120) NOT NULL,
  fecha_entrega DATE NULL,
  estado_despacho VARCHAR(30) NOT NULL DEFAULT 'EN_PROCESO',
  fecha_sincronizacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_contratos_externo UNIQUE (id_contrato_externo)
) ENGINE=InnoDB;

-- 07. Requerimientos de productos por contrato
CREATE TABLE contrato_detalles (
  id_detalle_contrato INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_contrato INT UNSIGNED NOT NULL,
  id_producto INT UNSIGNED NOT NULL,
  cantidad_requerida INT UNSIGNED NOT NULL,
  CONSTRAINT chk_contrato_detalles_cantidad CHECK (cantidad_requerida > 0),
  CONSTRAINT fk_contrato_detalles_contrato FOREIGN KEY (id_contrato)
    REFERENCES contratos_local(id_contrato),
  CONSTRAINT fk_contrato_detalles_producto FOREIGN KEY (id_producto)
    REFERENCES inventario_productos(id_producto)
) ENGINE=InnoDB;

-- 08. Historial de modificaciones de la cantidad requerida
CREATE TABLE contrato_detalle_cambios (
  id_cambio INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_detalle_contrato INT UNSIGNED NOT NULL,
  cantidad_anterior INT UNSIGNED NOT NULL,
  cantidad_nueva INT UNSIGNED NOT NULL,
  fecha_cambio DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  motivo TEXT NULL,
  CONSTRAINT fk_cambios_detalle FOREIGN KEY (id_detalle_contrato)
    REFERENCES contrato_detalles(id_detalle_contrato)
) ENGINE=InnoDB;

-- ================================================================
-- BLOQUE 3: ORDENES CONSOLIDADAS Y TRAZABILIDAD A CONTRATOS
-- ================================================================

-- 09. Una orden de compra pertenece a un proveedor
CREATE TABLE orden_compras (
  id_orden INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_proveedor INT UNSIGNED NOT NULL,
  fecha_emision DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  estado_orden VARCHAR(30) NOT NULL DEFAULT 'EMITIDA',
  CONSTRAINT fk_ordenes_proveedor FOREIGN KEY (id_proveedor)
    REFERENCES proveedores(id_proveedor)
) ENGINE=InnoDB;

-- 10. Una linea por producto consolidado dentro de la orden
CREATE TABLE orden_compra_detalles (
  id_orden_detalle INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_producto INT UNSIGNED NOT NULL,
  id_orden INT UNSIGNED NOT NULL,
  cantidad_pedida INT UNSIGNED NOT NULL,
  CONSTRAINT uq_orden_detalle_producto UNIQUE (id_orden, id_producto),
  CONSTRAINT chk_orden_detalles_cantidad CHECK (cantidad_pedida > 0),
  CONSTRAINT fk_orden_detalles_orden FOREIGN KEY (id_orden)
    REFERENCES orden_compras(id_orden),
  CONSTRAINT fk_orden_detalles_producto FOREIGN KEY (id_producto)
    REFERENCES inventario_productos(id_producto)
) ENGINE=InnoDB;

-- 11. Relacion N:M entre detalle de orden y detalle de contrato
-- Permite consultar que colegios y cantidades originaron cada linea.
CREATE TABLE orden_compra_detalle_contrato (
  id_asignacion INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_orden_detalle INT UNSIGNED NOT NULL,
  id_detalle_contrato INT UNSIGNED NOT NULL,
  cantidad_asignada INT UNSIGNED NOT NULL,
  CONSTRAINT uq_asignacion_orden_contrato UNIQUE (id_orden_detalle, id_detalle_contrato),
  CONSTRAINT chk_asignacion_cantidad CHECK (cantidad_asignada > 0),
  CONSTRAINT fk_asignacion_orden_detalle FOREIGN KEY (id_orden_detalle)
    REFERENCES orden_compra_detalles(id_orden_detalle),
  CONSTRAINT fk_asignacion_contrato_detalle FOREIGN KEY (id_detalle_contrato)
    REFERENCES contrato_detalles(id_detalle_contrato)
) ENGINE=InnoDB;

-- ================================================================
-- BLOQUE 4: COMPRA CONFIRMADA, CUENTAS POR PAGAR Y ABONOS
-- ================================================================

-- 12. Una orden puede llegar a convertirse en una compra confirmada
CREATE TABLE compras (
  id_compra INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_orden INT UNSIGNED NOT NULL,
  ruta_cotizacion VARCHAR(150) NULL,
  fecha_compra DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  tipo_comprobante VARCHAR(30) NULL,
  num_comprobante VARCHAR(30) NULL,
  total DECIMAL(8,2) NOT NULL DEFAULT 0.00,
  estado VARCHAR(25) NOT NULL DEFAULT 'CONFIRMADA',
  CONSTRAINT uq_compras_orden UNIQUE (id_orden),
  CONSTRAINT chk_compras_total CHECK (total >= 0),
  CONSTRAINT fk_compras_orden FOREIGN KEY (id_orden)
    REFERENCES orden_compras(id_orden)
) ENGINE=InnoDB;

-- 13. Una cuenta por pagar por compra, cuando corresponda
CREATE TABLE cuentas_por_pagar (
  id_cuenta INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_compra INT UNSIGNED NOT NULL,
  numero_factura VARCHAR(50) NULL,
  monto_total DECIMAL(8,2) NOT NULL,
  saldo_pendiente DECIMAL(8,2) NOT NULL,
  estado_pago VARCHAR(25) NOT NULL DEFAULT 'PENDIENTE',
  CONSTRAINT uq_cuenta_compra UNIQUE (id_compra),
  CONSTRAINT chk_cuenta_monto CHECK (monto_total >= 0),
  CONSTRAINT chk_cuenta_saldo CHECK (saldo_pendiente >= 0 AND saldo_pendiente <= monto_total),
  CONSTRAINT fk_cuenta_compra FOREIGN KEY (id_compra)
    REFERENCES compras(id_compra)
) ENGINE=InnoDB;

-- 14. Multiples pagos parciales por cuenta
CREATE TABLE pagos_abono (
  id_abono INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_cuenta INT UNSIGNED NOT NULL,
  monto_abonado DECIMAL(12,2) NOT NULL,
  fecha_pago DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metodo_pago VARCHAR(50) NOT NULL,
  referencia_pago VARCHAR(100) NULL,
  CONSTRAINT chk_abono_monto CHECK (monto_abonado > 0),
  CONSTRAINT fk_abonos_cuenta FOREIGN KEY (id_cuenta)
    REFERENCES cuentas_por_pagar(id_cuenta)
) ENGINE=InnoDB;

-- ================================================================
-- BLOQUE 5: RECEPCIONES PARCIALES E INCIDENCIAS
-- ================================================================

-- 15. Una compra puede tener varios lotes/entregas
CREATE TABLE recepcion_lotes (
  id_lote INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_compra INT UNSIGNED NOT NULL,
  codigo_lote VARCHAR(40) NOT NULL,
  fecha_recepcion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  estado_inspeccion VARCHAR(25) NOT NULL DEFAULT 'PENDIENTE',
  observaciones TEXT NULL,
  CONSTRAINT uq_lotes_codigo UNIQUE (codigo_lote),
  CONSTRAINT fk_lotes_compra FOREIGN KEY (id_compra)
    REFERENCES compras(id_compra)
) ENGINE=InnoDB;

-- 16. Productos encontrados en cada lote
CREATE TABLE recepcion_detalles (
  id_recepcion_detalle INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_lote INT UNSIGNED NOT NULL,
  id_producto INT UNSIGNED NOT NULL,
  cantidad_esperada INT UNSIGNED NOT NULL DEFAULT 0,
  cantidad_recibida INT UNSIGNED NOT NULL DEFAULT 0,
  cantidad_conforme INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT chk_recepcion_cantidades CHECK (cantidad_conforme <= cantidad_recibida),
  CONSTRAINT fk_recepcion_detalles_lote FOREIGN KEY (id_lote)
    REFERENCES recepcion_lotes(id_lote),
  CONSTRAINT fk_recepcion_detalles_producto FOREIGN KEY (id_producto)
    REFERENCES inventario_productos(id_producto)
) ENGINE=InnoDB;

-- 17. Incidencias detectadas en la recepcion
CREATE TABLE incidencias (
  id_incidencia INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_recepcion_detalle INT UNSIGNED NOT NULL,
  tipo_incidencia VARCHAR(50) NOT NULL,
  cantidad_afectada INT UNSIGNED NOT NULL,
  descripcion TEXT NULL,
  estado_reposicion VARCHAR(25) NOT NULL DEFAULT 'PENDIENTE',
  fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_incidencia_cantidad CHECK (cantidad_afectada > 0),
  CONSTRAINT fk_incidencia_recepcion FOREIGN KEY (id_recepcion_detalle)
    REFERENCES recepcion_detalles(id_recepcion_detalle)
) ENGINE=InnoDB;

-- 18. Historial de cantidades repuestas por incidencia
CREATE TABLE incidencia_reposiciones (
  id_reposicion INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_incidencia INT UNSIGNED NOT NULL,
  cantidad_repuesta INT UNSIGNED NOT NULL,
  fecha_registro DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_reposicion_cantidad CHECK (cantidad_repuesta > 0),
  CONSTRAINT fk_reposiciones_incidencia FOREIGN KEY (id_incidencia)
    REFERENCES incidencias(id_incidencia)
) ENGINE=InnoDB;

-- ================================================================
-- BLOQUE 6: PREPARACION ACUMULADA Y DESPACHO COMPLETO
-- ================================================================

-- 19. Cada despacho corresponde a un contrato; un contrato puede
-- tener varios registros historicos (si las reglas de negocio lo permiten).
CREATE TABLE despachos_salida (
  id_despacho INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_contrato INT UNSIGNED NOT NULL,
  codigo_despacho VARCHAR(40) NOT NULL,
  fecha_creacion DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fecha_despacho DATETIME NULL,
  estado_despacho VARCHAR(30) NOT NULL DEFAULT 'EN_PREPARACION',
  observaciones TEXT NULL,
  CONSTRAINT uq_despachos_codigo UNIQUE (codigo_despacho),
  CONSTRAINT fk_despachos_contrato FOREIGN KEY (id_contrato)
    REFERENCES contratos_local(id_contrato)
) ENGINE=InnoDB;

-- 20. Avance acumulado de cada producto; sin cantidad_enviada
-- porque el negocio confirmo entrega completa, no parcial.
CREATE TABLE despacho_detalles (
  id_despacho_detalle INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_despacho INT UNSIGNED NOT NULL,
  id_producto INT UNSIGNED NOT NULL,
  cantidad_preparada INT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT uq_despacho_producto UNIQUE (id_despacho, id_producto),
  CONSTRAINT fk_despacho_detalles_despacho FOREIGN KEY (id_despacho)
    REFERENCES despachos_salida(id_despacho),
  CONSTRAINT fk_despacho_detalles_producto FOREIGN KEY (id_producto)
    REFERENCES inventario_productos(id_producto)
) ENGINE=InnoDB;

-- ================================================================
-- BLOQUE 7: KARDEX (DEPENDE DE RECEPCIONES Y DESPACHOS)
-- ================================================================

-- 21. Movimiento fisico de inventario. Las FKs de origen son
-- opcionales porque los ajustes manuales pueden carecer de documento.
CREATE TABLE kardex_movimientos (
  id_movimiento INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_producto INT UNSIGNED NOT NULL,
  id_recepcion_detalle INT UNSIGNED NULL,
  id_despacho_detalle INT UNSIGNED NULL,
  tipo_movimiento VARCHAR(25) NOT NULL,
  cantidad INT UNSIGNED NOT NULL,
  fecha_movimiento DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  descripcion VARCHAR(255) NULL,
  CONSTRAINT chk_kardex_cantidad CHECK (cantidad > 0),
  CONSTRAINT chk_kardex_origen CHECK (
      id_recepcion_detalle IS NULL OR id_despacho_detalle IS NULL
  ),
  CONSTRAINT fk_kardex_producto FOREIGN KEY (id_producto)
    REFERENCES inventario_productos(id_producto),
  CONSTRAINT fk_kardex_recepcion FOREIGN KEY (id_recepcion_detalle)
    REFERENCES recepcion_detalles(id_recepcion_detalle),
  CONSTRAINT fk_kardex_despacho FOREIGN KEY (id_despacho_detalle)
    REFERENCES despacho_detalles(id_despacho_detalle)
) ENGINE=InnoDB;


-- REGLAS A IMPLEMENTAR EN EL BACKEND (NO RESUELTAS SOLO CON FK):
-- * Agrupar por (proveedor, producto) y registrar origen en tabla intermedia.
-- * Validar suma(cantidad_asignada) = cantidad_pedida por linea.
-- * Validar producto de asignacion = producto de contrato_detalles.
-- * Evitar pedidos duplicados al reconsultar contratos de la API.
-- * Impedir recepciones que excedan lo previsto segun reglas acordadas.
-- * Registrar reposiciones con su ingreso sin duplicar movimientos.
-- * Mantener cuentas_por_pagar.saldo_pendiente consistente con abonos.
-- * Registrar avance sin tocar stock; descontar solo al confirmar envio.
-- * Confirmar despacho y escribir kardex/stock en UNA transaccion, con
--   bloqueo de existencias y proteccion contra ejecucion repetida.
-- * Los ajustes manuales deben quedar justificados y autorizados.
-- * Envio completo: verificar contra TODAS las lineas del contrato.
-- * La tabla incidencia_reposiciones guarda cantidades repuestas,
--   pero no identifica la recepcion especifica de reposicion.
