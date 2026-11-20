-- Variantes oficiales de Joselito para el catalogo de Compras.
-- El catalogo original confirma: Maravillas AcadÃ©mico/Acanalados y Mi Promo/Bio Gloss.
-- Los IDs se autogeneran. No se modifican modelos base ni precios.
-- Las imÃ¡genes se asociaron segÃºn la correspondencia confirmada por la usuaria.
SET NAMES utf8mb4;

START TRANSACTION;

INSERT INTO modelos
  (id_diseno, nombre_modelo, presentacion, nivel_educativo, precio, imagen_path, estado)
SELECT d.id_diseno, v.nombre_modelo, v.presentacion, 'Primaria - Superior', NULL, v.imagen_path, 1
FROM (
  SELECT 'Maravillas AcadÃ©mico' AS nombre_modelo,
         'Acanalados' AS nombre_diseno,
         'Piezas 3D y fondo brillantes' AS presentacion,
         '/uploads/modelos/3d2594ed-eb47-421f-b94f-2e0cc84e05af.png' AS imagen_path
  UNION ALL SELECT 'Maravillas AcadÃ©mico', 'Acanalados', 'Canal con espejo rÃ©flex',
         '/uploads/modelos/5434b496-50df-44ad-90fa-7532e5a6829c.png'
  UNION ALL SELECT 'Mi Promo', 'Bio Gloss', 'Superficie acrÃ­lica cristalina',
         '/uploads/modelos/a61f1ca0-3088-4d5d-9420-c08d99ddee64.png'
  UNION ALL SELECT 'Mi Promo', 'Bio Gloss', 'Esquinas espejo rÃ©flex',
         '/uploads/modelos/5cfc2028-6f70-4d4f-b76f-2fa56b812b8c.png'
) AS v
JOIN categorias c ON LOWER(TRIM(c.nombre_categoria)) = 'cuadros' AND c.estado = 1
JOIN proveedores p ON LOWER(TRIM(p.razon_social)) = 'joselito' AND p.estado = 'Activo'
JOIN disenios d ON d.id_categoria = c.id_categoria
  AND d.id_proveedor = p.id_proveedor
  AND LOWER(TRIM(d.nombre_diseno)) = LOWER(TRIM(v.nombre_diseno))
  AND d.estado = 1
WHERE NOT EXISTS (
  SELECT 1
  FROM modelos existente
  JOIN disenios ed ON ed.id_diseno = existente.id_diseno
  JOIN categorias ec ON ec.id_categoria = ed.id_categoria
  JOIN proveedores ep ON ep.id_proveedor = ed.id_proveedor
  WHERE LOWER(TRIM(ep.razon_social)) = 'joselito'
    AND LOWER(TRIM(ec.nombre_categoria)) = 'cuadros'
    AND LOWER(TRIM(ed.nombre_diseno)) = LOWER(TRIM(v.nombre_diseno))
    AND LOWER(TRIM(existente.nombre_modelo)) = LOWER(TRIM(v.nombre_modelo))
    AND LOWER(TRIM(existente.presentacion)) = LOWER(TRIM(v.presentacion))
);

COMMIT;
