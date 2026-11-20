-- Asocia las cuatro imÃ¡genes recibidas a las variantes exactas de Joselito.
-- Idempotente: solo completa la imagen cuando el campo estÃ¡ vacÃ­o o ya tiene esta ruta.
SET NAMES utf8mb4;

UPDATE modelos m
JOIN disenios d ON d.id_diseno = m.id_diseno
JOIN categorias c ON c.id_categoria = d.id_categoria
JOIN proveedores p ON p.id_proveedor = d.id_proveedor
JOIN (
  SELECT 'Maravillas AcadÃ©mico' AS nombre_modelo,
         'Piezas 3D y fondo brillantes' AS presentacion,
         'Acanalados' AS nombre_diseno,
         '/uploads/modelos/3d2594ed-eb47-421f-b94f-2e0cc84e05af.png' AS imagen_path
  UNION ALL SELECT 'Maravillas AcadÃ©mico', 'Canal con espejo rÃ©flex', 'Acanalados',
         '/uploads/modelos/5434b496-50df-44ad-90fa-7532e5a6829c.png'
  UNION ALL SELECT 'Mi Promo', 'Superficie acrÃ­lica cristalina', 'Bio Gloss',
         '/uploads/modelos/a61f1ca0-3088-4d5d-9420-c08d99ddee64.png'
  UNION ALL SELECT 'Mi Promo', 'Esquinas espejo rÃ©flex', 'Bio Gloss',
         '/uploads/modelos/5cfc2028-6f70-4d4f-b76f-2fa56b812b8c.png'
) v ON LOWER(TRIM(v.nombre_modelo)) = LOWER(TRIM(m.nombre_modelo))
  AND LOWER(TRIM(v.presentacion)) = LOWER(TRIM(m.presentacion))
  AND LOWER(TRIM(v.nombre_diseno)) = LOWER(TRIM(d.nombre_diseno))
SET m.imagen_path = v.imagen_path
WHERE LOWER(TRIM(p.razon_social)) = 'joselito'
  AND LOWER(TRIM(c.nombre_categoria)) = 'cuadros'
  AND m.nivel_educativo = 'Primaria - Superior'
  AND m.precio IS NULL
  AND (m.imagen_path IS NULL OR m.imagen_path = v.imagen_path);
