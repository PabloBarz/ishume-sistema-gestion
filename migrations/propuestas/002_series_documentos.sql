-- PROPUESTA PARA APROBACIÓN. NO EJECUTADA. No aplicar sin respaldo y autorización.
-- No renumera documentos, no cambia claves foráneas existentes ni AUTO_INCREMENT.
-- Antes de aplicar, revisar que cada proveedor tenga un solo prefijo histórico.
SELECT id_proveedor, COUNT(DISTINCT SUBSTRING_INDEX(codigo,'-',2)) AS prefijos,
       MAX(CAST(SUBSTRING_INDEX(codigo,'-',-1) AS UNSIGNED)) AS ultimo_numero
FROM ordenes_compra
WHERE codigo REGEXP '^OC-[A-Z0-9]+-[0-9]+$'
GROUP BY id_proveedor;

-- Tabla adicional propuesta: serie estable por proveedor y otra para órdenes masivas.
CREATE TABLE series_documentos (
  clave VARCHAR(64) NOT NULL,
  id_proveedor INT NULL,
  prefijo VARCHAR(20) NOT NULL,
  ultimo_numero BIGINT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (clave),
  UNIQUE KEY uq_serie_proveedor (id_proveedor),
  UNIQUE KEY uq_serie_prefijo (prefijo),
  CONSTRAINT fk_serie_proveedor FOREIGN KEY (id_proveedor) REFERENCES proveedores (id_proveedor)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Solo proveedores con un único prefijo inequívoco. Si hay varios, detener y revisar.
-- Reservar OC-MAS para documentos consolidados; no asignarlo a un proveedor.
INSERT INTO series_documentos (clave,id_proveedor,prefijo,ultimo_numero)
SELECT CONCAT('PEDIDO:',id_proveedor),id_proveedor,MIN(SUBSTRING_INDEX(codigo,'-',2)),
       MAX(CAST(SUBSTRING_INDEX(codigo,'-',-1) AS UNSIGNED))
FROM ordenes_compra
WHERE codigo REGEXP '^OC-[A-Z0-9]+-[0-9]+$' AND codigo NOT LIKE 'OC-MAS-%'
GROUP BY id_proveedor
HAVING COUNT(DISTINCT SUBSTRING_INDEX(codigo,'-',2))=1;

INSERT INTO series_documentos (clave,id_proveedor,prefijo,ultimo_numero)
SELECT 'ORDEN_MASIVA',NULL,'OC-MAS',COALESCE(MAX(CAST(SUBSTRING_INDEX(codigo,'-',-1) AS UNSIGNED)),0)
FROM solicitudes_cotizacion WHERE codigo REGEXP '^OC-MAS-[0-9]+$';

-- Cambio de aplicación FUTURO, solo después de aprobar y validar esta propuesta:
-- Dentro de la MISMA transacción de guardado:
-- SELECT prefijo,ultimo_numero FROM series_documentos WHERE clave=? FOR UPDATE;
-- UPDATE series_documentos SET ultimo_numero=ultimo_numero+1 WHERE clave=?;
-- Formar el código con el nuevo número (mínimo 4 dígitos, sin truncarlo),
-- comprobar colisiones y guardar conservando los índices únicos existentes.
-- Un proveedor sin serie debe configurarse con un prefijo único antes de emitir.
-- Mantener tokens, bloqueos e idempotencia actuales. Nunca usar COUNT(*)+1.
