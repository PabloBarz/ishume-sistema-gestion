-- Retira los registros genÃ©ricos duplicados de Joselito, conservando las variantes detalladas.
-- Preflight realizado: sin referencias en contratos/Ã³rdenes Node ni en contratos/combos PHP.
-- Los archivos de imagen originales se conservan por si se revierte la migraciÃ³n.
SET NAMES utf8mb4;
START TRANSACTION;

DELETE m
FROM modelos m
JOIN disenios d ON d.id_diseno = m.id_diseno
JOIN categorias c ON c.id_categoria = d.id_categoria
JOIN proveedores p ON p.id_proveedor = d.id_proveedor
WHERE (
    (m.id_modelo = 19 AND m.nombre_modelo = 'MI PROMO'
      AND m.presentacion IS NULL AND d.nombre_diseno = 'BIO GLOSS')
    OR
    (m.id_modelo = 21 AND m.nombre_modelo = 'MARAVILLAS ACADEMICO'
      AND m.presentacion IS NULL AND d.nombre_diseno = 'ACANALADOS')
  )
  AND c.nombre_categoria = 'CUADROS'
  AND p.razon_social = 'Joselito'
  AND NOT EXISTS (
    SELECT 1 FROM contrato_detalles cd WHERE cd.id_modelo = m.id_modelo
  )
  AND NOT EXISTS (
    SELECT 1 FROM orden_detalles od WHERE od.id_modelo = m.id_modelo
  );

COMMIT;

-- Debe devolver cero filas para confirmar que ambos registros fueron retirados.
SELECT id_modelo, nombre_modelo
FROM modelos
WHERE id_modelo IN (19, 21);
