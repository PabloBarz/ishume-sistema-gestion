USE bd_ishume;
-- PROPUESTA: columnas en proveedores, sin tablas nuevas ni renumeracion.
ALTER TABLE proveedores
  ADD prefijo_orden_masiva VARCHAR(8) NULL,
  ADD ultimo_orden_masiva BIGINT UNSIGNED NOT NULL DEFAULT 0,
  ADD UNIQUE KEY uq_proveedor_prefijo_masivo (prefijo_orden_masiva);
-- Recupera el maximo existente del nuevo formato por ID real del proveedor.
UPDATE proveedores p LEFT JOIN (
  SELECT id_proveedor,MAX(CAST(SUBSTRING_INDEX(codigo,'-',-1) AS UNSIGNED)) AS numero,
    MIN(SUBSTRING_INDEX(SUBSTRING_INDEX(codigo,'-',3),'-',-1)) AS prefijo
  FROM solicitudes_cotizacion WHERE codigo REGEXP '^ORDEN-MAS-[A-Z0-9]+-[0-9]+$'
  GROUP BY id_proveedor
) s ON s.id_proveedor=p.id_proveedor
SET p.ultimo_orden_masiva=COALESCE(s.numero,0),p.prefijo_orden_masiva=s.prefijo;
-- Proveedores sin nuevo codigo: prefijo se fija en su primera orden.
-- UNIQUE protege colisiones de prefijo; FOR UPDATE serializa por proveedor.
-- No modifica codigos OC-MAS ni los pedidos internos OC-JOS/OC-LAL/OC-LIB.
