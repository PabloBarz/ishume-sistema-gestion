USE bd_ishume;
-- PROPUESTA MANUAL: 19 tablas, sin tablas nuevas ni renumeracion.
-- Ejecutar una sola vez, con la aplicacion detenida durante esta migracion.
-- Comprobado: la base actual carece de ambas columnas. No ejecutar database/ishume.sql
-- sobre esta base existente: ese archivo es solo para una instalacion vacia.
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
SET p.ultimo_orden_masiva=GREATEST(p.ultimo_orden_masiva,COALESCE(s.numero,0)),
    p.prefijo_orden_masiva=COALESCE(p.prefijo_orden_masiva,s.prefijo);
-- Proveedores sin nuevo codigo: prefijo se fija en su primera orden.
-- UNIQUE protege colisiones de prefijo; FOR UPDATE serializa por proveedor.
-- No modifica codigos OC-MAS ni los pedidos internos OC-JOS/OC-LAL/OC-LIB.

-- Verificacion posterior (solo lectura):
SELECT id_proveedor,razon_social,prefijo_orden_masiva,ultimo_orden_masiva FROM proveedores;
-- Con los registros actuales OC-MAS, la nueva serie empieza en 001 por proveedor.
-- No se altera ninguno de esos registros historicos.
