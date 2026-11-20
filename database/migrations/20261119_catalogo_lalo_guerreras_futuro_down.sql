-- Revierte Ãºnicamente el modelo agregado por 20261119_catalogo_lalo_guerreras_futuro_up.sql.
-- La imagen se conserva en storage/uploads/modelos para permitir volver a aplicarlo.
SET NAMES utf8mb4;
START TRANSACTION;

DELETE m
FROM modelos m
JOIN disenios d ON d.id_diseno = m.id_diseno
JOIN categorias c ON c.id_categoria = d.id_categoria
JOIN proveedores p ON p.id_proveedor = d.id_proveedor
WHERE m.imagen_path = '/uploads/modelos/521f2be8-67f6-4fe1-8428-c9c6eb15752b.png'
  AND m.nombre_modelo = 'Guerreras del futuro'
  AND m.nivel_educativo = 'PRONOEI - Inicial'
  AND d.nombre_diseno = 'RESINADO'
  AND c.nombre_categoria = 'CUADROS'
  AND p.razon_social = 'LALO';

-- Elimina el diseÃ±o nuevo solo si quedÃ³ vacÃ­o. No afecta otros diseÃ±os ni proveedores.
DELETE d
FROM disenios d
JOIN categorias c ON c.id_categoria = d.id_categoria
JOIN proveedores p ON p.id_proveedor = d.id_proveedor
WHERE d.nombre_diseno = 'RESINADO'
  AND c.nombre_categoria = 'CUADROS'
  AND p.razon_social = 'LALO'
  AND NOT EXISTS (SELECT 1 FROM modelos m WHERE m.id_diseno = d.id_diseno);

COMMIT;
