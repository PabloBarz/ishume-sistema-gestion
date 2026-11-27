-- 30 tablas: 23 operativas y 7 de autenticacion/autorizacion.
-- Esquema completo propuesto; las funcionalidades futuras aun requieren backend.
-- Ejecutar solo en base vacia. Fuente unica del esquema de desarrollo.
-- DB_NAME debe apuntar a bd_ishume al utilizar esta instalacion.
-- ISHUME | ESQUEMA UNIFICADO DE DESARROLLO
-- MySQL 8.0.16+ / MariaDB con CHECK y JSON.
-- Ejecutar en una BASE NUEVA. No migra ni borra datos de bases anteriores.
-- Convencion: identificadores INT UNSIGNED, InnoDB, utf8mb4_unicode_ci.
-- El sistema externo consume nuestro catalogo y devuelve nuestros id_modelo.
-- NOTA: la asignacion contractual no equivale a clasificacion fisica.

CREATE DATABASE IF NOT EXISTS bd_ishume
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE bd_ishume;
SET time_zone = '-05:00';

-- 01. Proveedores: esquema funcional del modulo Compras.
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

-- 02. Catalogos para compras bajo pedido.
CREATE TABLE categorias (
  id_categoria INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre_categoria VARCHAR(30) NOT NULL,
  estado TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT uq_categorias_nombre UNIQUE (nombre_categoria)
) ENGINE=InnoDB;


-- 03
CREATE TABLE disenios (
    id_diseno INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    id_categoria INT UNSIGNED NOT NULL,
    id_proveedor INT UNSIGNED NOT NULL,
    nombre_diseno VARCHAR(30) NOT NULL,
    estado TINYINT(1) NOT NULL DEFAULT 1,

    CONSTRAINT fk_disenios_categoria
        FOREIGN KEY (id_categoria)
        REFERENCES categorias(id_categoria)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    CONSTRAINT fk_disenios_proveedor
        FOREIGN KEY (id_proveedor)
        REFERENCES proveedores(id_proveedor)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
) ENGINE=InnoDB;

-- 04. Catalogo local compartido con el sistema externo.
CREATE TABLE modelos (
  id_modelo INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_diseno INT UNSIGNED NOT NULL,
  imagen_path VARCHAR(500) NULL,
  nombre_modelo VARCHAR(60) NOT NULL,
  presentacion VARCHAR(255) NULL,
  nivel_educativo VARCHAR(30) NULL,
  precio DECIMAL(10,2) NULL DEFAULT NULL,
  CONSTRAINT chk_modelos_precio CHECK (precio >= 0),
  CONSTRAINT chk_modelos_nivel_educativo CHECK (nivel_educativo IS NULL OR nivel_educativo IN ('PRONOEI - Inicial', 'Primaria - Superior')),
  estado TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT fk_modelos_diseno FOREIGN KEY (id_diseno)
    REFERENCES disenios(id_diseno) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- 05. Contratos locales de API o excepciones manuales.
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

-- 06. Detalles contractuales vinculados al catalogo local de modelos.
CREATE TABLE contrato_detalles (
  id_detalle_contrato INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_contrato INT UNSIGNED NOT NULL,
  id_modelo INT UNSIGNED NOT NULL,
  cantidad_requerida INT UNSIGNED NOT NULL,
  CONSTRAINT chk_cd_cantidad CHECK (cantidad_requerida > 0),
  CONSTRAINT fk_cd_contrato FOREIGN KEY (id_contrato)
    REFERENCES contratos_referencia(id_contrato) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_cd_modelo FOREIGN KEY (id_modelo)
    REFERENCES modelos(id_modelo) ON UPDATE CASCADE ON DELETE RESTRICT,
  INDEX idx_cd_contrato (id_contrato)
) ENGINE=InnoDB;

-- 07. Ordenes internas por proveedor (Compras).
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

-- 08. Lineas consolidadas por modelo del catalogo.
CREATE TABLE orden_detalles (
  id_orden_detalle INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_orden INT UNSIGNED NOT NULL,
  id_modelo INT UNSIGNED NOT NULL,
  cantidad_pedida INT UNSIGNED NOT NULL,
  precio_unitario DECIMAL(12,2) NULL,
  CONSTRAINT chk_od_cantidad CHECK (cantidad_pedida > 0),
  CONSTRAINT chk_od_precio CHECK (precio_unitario IS NULL OR precio_unitario >= 0),
  CONSTRAINT uq_od_orden_modelo UNIQUE (id_orden,id_modelo),
  CONSTRAINT fk_od_orden FOREIGN KEY (id_orden)
    REFERENCES ordenes_compra(id_orden) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_od_modelo FOREIGN KEY (id_modelo)
    REFERENCES modelos(id_modelo) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- 09. Asignacion DOCUMENTAL de una linea de compra a cada contrato.
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

-- 10. Ordenes masivas/cotizaciones: campos originales de Compras.
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

-- 11. Una orden interna pertenece como maximo a una solicitud masiva.
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

-- 12. Abonos parciales, saldo calculado por consultas.
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

-- 13. Auditoria de correcciones de pagos: esquema conservado.
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

-- 14. Recepciones: lote real mezclado, ligado a orden interna por proveedor.
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

-- 15. Cantidades por producto dentro de cada lote, incluidas incidencias.
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

-- 16. Clasificacion FISICA posterior: cuantas unidades conformes de un lote
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

-- 17. Incidencias al recibir: faltantes, danos o producto incorrecto.
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

-- 18. Reposiciones de proveedor: historico; ingreso fisico debe registrarse
-- como nueva recepcion vinculada al pedido.
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

-- 19. Cabecera de preparacion por contrato (armado tras editar fotos).
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

-- 20. Avances parciales de armado por detalle del contrato.
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

-- 21. Despacho completo por contrato; se confirma una sola vez.
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

-- 22. Cantidades confirmadas por linea contractual, sin despacho parcial.
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

-- 23. Kardex: movimientos fisicos vinculados a su detalle de origen.
CREATE TABLE movimientos_inventario (
  id_movimiento INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tipo ENUM('Entrada','Salida') NOT NULL,
  cantidad INT UNSIGNED NOT NULL,
  fecha_movimiento DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  id_recepcion_detalle INT UNSIGNED NULL,
  id_despacho_detalle INT UNSIGNED NULL,
  descripcion TEXT NULL,
  CONSTRAINT chk_mi_cantidad CHECK (cantidad > 0),
  CONSTRAINT chk_mi_origen_tipo CHECK (
    (tipo = 'Entrada' AND id_recepcion_detalle IS NOT NULL AND id_despacho_detalle IS NULL)
    OR (tipo = 'Salida' AND id_despacho_detalle IS NOT NULL AND id_recepcion_detalle IS NULL)
  ),
  CONSTRAINT uq_mi_recepcion_detalle UNIQUE (id_recepcion_detalle),
  CONSTRAINT uq_mi_despacho_detalle UNIQUE (id_despacho_detalle),
  CONSTRAINT fk_mi_recepcion_detalle FOREIGN KEY (id_recepcion_detalle)
    REFERENCES recepcion_detalles(id_recepcion_detalle)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  CONSTRAINT fk_mi_despacho_detalle FOREIGN KEY (id_despacho_detalle)
    REFERENCES despacho_detalles(id_despacho_detalle)
    ON UPDATE RESTRICT ON DELETE RESTRICT,
  INDEX idx_mi_fecha (fecha_movimiento, id_movimiento)
) ENGINE=InnoDB;

-- 24. Personas trabajadoras; los datos personales se separan de credenciales.
CREATE TABLE personas (
  id_persona INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombres VARCHAR(120) NOT NULL,
  apellidos VARCHAR(120) NOT NULL,
  tipo_documento VARCHAR(30) NULL,
  numero_documento VARCHAR(30) NULL,
  telefono VARCHAR(30) NULL,
  correo VARCHAR(150) NULL,
  estado TINYINT(1) NOT NULL DEFAULT 1,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_personas_documento
    UNIQUE (tipo_documento, numero_documento),
  CONSTRAINT chk_personas_documento_par
    CHECK (
      (tipo_documento IS NULL AND numero_documento IS NULL)
      OR
      (tipo_documento IS NOT NULL AND numero_documento IS NOT NULL)
    ),
  CONSTRAINT chk_personas_estado CHECK (estado IN (0, 1))
) ENGINE=InnoDB;

-- 25. Perfiles base; el codigo administrador queda reservado en Node.js.
CREATE TABLE roles (
  id_rol INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo VARCHAR(40) NOT NULL,
  nombre VARCHAR(80) NOT NULL,
  descripcion VARCHAR(255) NULL,
  estado TINYINT(1) NOT NULL DEFAULT 1,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_roles_codigo UNIQUE (codigo),
  CONSTRAINT uq_roles_nombre UNIQUE (nombre),
  CONSTRAINT chk_roles_estado CHECK (estado IN (0, 1))
) ENGINE=InnoDB;

-- 26. Catalogo granular por modulo y operacion.
CREATE TABLE permisos (
  id_permiso INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo VARCHAR(100) NOT NULL,
  modulo VARCHAR(60) NOT NULL,
  accion VARCHAR(40) NOT NULL,
  descripcion VARCHAR(255) NULL,
  CONSTRAINT uq_permisos_codigo UNIQUE (codigo),
  CONSTRAINT uq_permisos_modulo_accion UNIQUE (modulo, accion)
) ENGINE=InnoDB;

-- 27. Cuenta individual; id_persona UNIQUE implementa persona 1 : 0..1 usuario.
CREATE TABLE usuarios (
  id_usuario INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_persona INT UNSIGNED NOT NULL,
  username VARCHAR(60) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  id_rol INT UNSIGNED NOT NULL,
  estado TINYINT(1) NOT NULL DEFAULT 1,
  ultimo_acceso DATETIME NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_usuarios_persona UNIQUE (id_persona),
  CONSTRAINT uq_usuarios_username UNIQUE (username),
  CONSTRAINT chk_usuarios_estado CHECK (estado IN (0, 1)),
  CONSTRAINT fk_usuarios_persona FOREIGN KEY (id_persona)
    REFERENCES personas(id_persona) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_usuarios_rol FOREIGN KEY (id_rol)
    REFERENCES roles(id_rol) ON UPDATE CASCADE ON DELETE RESTRICT,
  INDEX idx_usuarios_rol_estado (id_rol, estado)
) ENGINE=InnoDB;

-- 28. Permisos heredados desde el rol base.
CREATE TABLE rol_permisos (
  id_rol INT UNSIGNED NOT NULL,
  id_permiso INT UNSIGNED NOT NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id_rol, id_permiso),
  CONSTRAINT fk_rol_permisos_rol FOREIGN KEY (id_rol)
    REFERENCES roles(id_rol) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_rol_permisos_permiso FOREIGN KEY (id_permiso)
    REFERENCES permisos(id_permiso) ON UPDATE CASCADE ON DELETE RESTRICT,
  INDEX idx_rol_permisos_permiso (id_permiso)
) ENGINE=InnoDB;

-- 29. Excepciones individuales: permitido=1 concede, permitido=0 deniega.
CREATE TABLE usuario_permisos (
  id_usuario INT UNSIGNED NOT NULL,
  id_permiso INT UNSIGNED NOT NULL,
  permitido TINYINT(1) NOT NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id_usuario, id_permiso),
  CONSTRAINT chk_usuario_permisos_permitido CHECK (permitido IN (0, 1)),
  CONSTRAINT fk_usuario_permisos_usuario FOREIGN KEY (id_usuario)
    REFERENCES usuarios(id_usuario) ON UPDATE CASCADE ON DELETE RESTRICT,
  CONSTRAINT fk_usuario_permisos_permiso FOREIGN KEY (id_permiso)
    REFERENCES permisos(id_permiso) ON UPDATE CASCADE ON DELETE RESTRICT,
  INDEX idx_usuario_permisos_permiso (id_permiso)
) ENGINE=InnoDB;

-- 30. Registro revocable de sesiones JWT; se almacena el hash del jti, no el token.
CREATE TABLE sesiones_usuario (
  id_sesion BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  id_usuario INT UNSIGNED NOT NULL,
  jti_hash CHAR(64) NOT NULL,
  expira_en DATETIME NOT NULL,
  revocada_en DATETIME NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_sesiones_usuario_jti_hash UNIQUE (jti_hash),
  CONSTRAINT fk_sesiones_usuario_usuario FOREIGN KEY (id_usuario)
    REFERENCES usuarios(id_usuario) ON UPDATE CASCADE ON DELETE RESTRICT,
  INDEX idx_sesiones_usuario_vigencia (id_usuario, revocada_en, expira_en)
) ENGINE=InnoDB;

-- Datos iniciales. El primer usuario Administrador se crea posteriormente
-- mediante el proceso seguro de bootstrap en Node.js.
INSERT INTO roles (codigo, nombre, descripcion) VALUES
  ('administrador', 'Administrador',
   'Acceso completo y administracion del sistema.'),
  ('consulta', 'Consulta', 'Perfil base de solo lectura.'),
  ('operador_confianza', 'Operador de confianza',
   'Perfil base de lectura; escrituras asignadas por usuario.')
ON DUPLICATE KEY UPDATE
  nombre = VALUES(nombre),
  descripcion = VALUES(descripcion);

INSERT INTO permisos (codigo, modulo, accion, descripcion) VALUES
  ('usuarios.consultar', 'usuarios', 'consultar', 'Consultar usuarios.'),
  ('usuarios.registrar', 'usuarios', 'registrar', 'Crear usuarios.'),
  ('usuarios.editar', 'usuarios', 'editar', 'Editar datos y rol de usuarios.'),
  ('usuarios.desactivar', 'usuarios', 'desactivar', 'Desactivar usuarios.'),
  ('usuarios.gestionar_permisos', 'usuarios', 'gestionar_permisos',
   'Gestionar excepciones individuales.'),
  ('roles.consultar', 'roles', 'consultar', 'Consultar roles.'),
  ('roles.gestionar', 'roles', 'gestionar', 'Gestionar roles.'),
  ('permisos.consultar', 'permisos', 'consultar', 'Consultar permisos.'),
  ('permisos.gestionar', 'permisos', 'gestionar', 'Gestionar permisos.'),

  ('dashboard.consultar', 'dashboard', 'consultar', 'Consultar dashboard.'),
  ('inventario.consultar', 'inventario', 'consultar', 'Consultar catalogo.'),

  ('categorias.consultar', 'categorias', 'consultar', 'Consultar categorias.'),
  ('categorias.registrar', 'categorias', 'registrar', 'Registrar categorias.'),
  ('categorias.editar', 'categorias', 'editar', 'Editar categorias.'),
  ('categorias.cambiar_estado', 'categorias', 'cambiar_estado',
   'Activar o desactivar categorias.'),

  ('disenios.consultar', 'disenios', 'consultar', 'Consultar disenios.'),
  ('disenios.registrar', 'disenios', 'registrar', 'Registrar disenios.'),
  ('disenios.editar', 'disenios', 'editar', 'Editar disenios.'),
  ('disenios.cambiar_estado', 'disenios', 'cambiar_estado',
   'Activar o desactivar disenios.'),

  ('modelos.consultar', 'modelos', 'consultar', 'Consultar modelos.'),
  ('modelos.registrar', 'modelos', 'registrar', 'Registrar modelos.'),
  ('modelos.editar', 'modelos', 'editar', 'Editar modelos.'),
  ('modelos.cambiar_estado', 'modelos', 'cambiar_estado',
   'Activar o desactivar modelos.'),

  ('proveedores.consultar', 'proveedores', 'consultar', 'Consultar proveedores.'),

  ('compras.consultar', 'compras', 'consultar', 'Consultar compras y solicitudes.'),
  ('compras.revisar', 'compras', 'revisar', 'Revisar compras.'),
  ('compras.confirmar', 'compras', 'confirmar', 'Confirmar compras.'),

  ('colegios.consultar', 'colegios', 'consultar', 'Consultar colegios.'),
  ('contratos.consultar', 'contratos', 'consultar', 'Consultar contratos.'),

  ('pagos.consultar', 'pagos', 'consultar', 'Consultar pagos, documentos y abonos.'),
  ('pagos.registrar_documento', 'pagos', 'registrar_documento',
   'Registrar documentos de pago.'),
  ('pagos.registrar_abono', 'pagos', 'registrar_abono', 'Registrar abonos.'),
  ('pagos.corregir_abono', 'pagos', 'corregir_abono', 'Corregir abonos.'),

  ('seguimiento_entrega.consultar', 'seguimiento_entrega', 'consultar',
   'Consultar seguimiento de entrega.'),
  ('kardex.consultar', 'kardex', 'consultar', 'Consultar movimientos de inventario.')
ON DUPLICATE KEY UPDATE
  modulo = VALUES(modulo),
  accion = VALUES(accion),
  descripcion = VALUES(descripcion);

-- Administrador queda asociado a todo el catalogo inicial.
INSERT IGNORE INTO rol_permisos (id_rol, id_permiso)
SELECT r.id_rol, p.id_permiso
FROM roles AS r
CROSS JOIN permisos AS p
WHERE r.codigo = 'administrador';

-- Consulta y Operador heredan lectura operativa; sus escrituras se asignan
-- como excepciones en usuario_permisos.
INSERT IGNORE INTO rol_permisos (id_rol, id_permiso)
SELECT r.id_rol, p.id_permiso
FROM roles AS r
JOIN permisos AS p
  ON p.accion = 'consultar'
 AND p.modulo IN (
   'dashboard', 'inventario', 'categorias', 'disenios', 'modelos',
   'proveedores', 'compras', 'colegios', 'contratos', 'pagos',
   'seguimiento_entrega', 'kardex'
 )
WHERE r.codigo IN ('consulta', 'operador_confianza');


-- REGLAS TRANSACCIONALES A IMPLEMENTAR EN EL BACKEND:
-- A. Los contratos externos devuelven modelos.id_modelo de nuestro catalogo.
--    El proveedor debe estar asociado al diseno del modelo.
-- B. Cada distribucion debe relacionar EL MISMO producto en orden_detalles
--    y contrato_detalles. Suma de distribuciones = cantidad_pedida al confirmar.
-- C. Cada recepcion_detalle debe pertenecer a la misma orden de su recepcion.
-- D. Cada recepcion_asignacion debe corresponder a la misma linea de compra;
--    suma clasificada <= cantidad conforme del lote y <= cantidad asignada.
-- E. Faltantes se calculan contra cantidad_pedida y recepciones acumuladas;
--    no se registran como entrada fisica.
-- F. Suma de avances preparados <= cantidad_requerida del contrato.
-- G. Confirmar despacho completo exige todas las lineas preparadas,
--    sin duplicar confirmacion; registrar cantidades por pedido.
-- H. movimientos_inventario ya existe; falta integrar su generacion
--    transaccional con la confirmacion de recepciones y despachos.
-- I. Usar transacciones, bloqueo de filas y controles de idempotencia.
-- J. No asumir que productos asignados documentalmente ya estan separados.
-- L. No usar `precio` del catalogo como costo real de compra; para eso
--    existe orden_detalles.precio_unitario y solicitudes_cotizacion.

SHOW TABLES;
