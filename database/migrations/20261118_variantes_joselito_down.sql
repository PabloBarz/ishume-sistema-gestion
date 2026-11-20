-- Reversion de los cuatro modelos insertados por 20261118_variantes_joselito_up.sql.
-- No borra modelos referenciados por contratos u Ã³rdenes.
SET NAMES utf8mb4;

START TRANSACTION;

DELETE m
FROM modelos m
JOIN disenios d ON d.id_diseno = m.id_diseno
JOIN categorias c ON c.id_categoria = d.id_categoria
JOIN proveedores p ON p.id_proveedor = d.id_proveedor
WHERE LOWER(TRIM(p.razon_social)) = 'joselito'
  AND LOWER(TRIM(c.nombre_categoria)) = 'cuadros'
  AND m.nivel_educativo = 'Primaria - Superior'
  AND m.precio IS NULL
  AND m.imagen_path IN (
    '/uploads/modelos/3d2594ed-eb47-421f-b94f-2e0cc84e05af.png',
    '/uploads/modelos/5434b496-50df-44ad-90fa-7532e5a6829c.png',
    '/uploads/modelos/a61f1ca0-3088-4d5d-9420-c08d99ddee64.png',
    '/uploads/modelos/5cfc2028-6f70-4d4f-b76f-2fa56b812b8c.png'
  )
  AND (
    (LOWER(TRIM(m.nombre_modelo)) = LOWER(TRIM('Maravillas AcadÃ©mico'))
      AND LOWER(TRIM(d.nombre_diseno)) = LOWER(TRIM('Acanalados'))
      AND LOWER(TRIM(m.presentacion)) IN (
        LOWER(TRIM('Piezas 3D y fondo brillantes')),
        LOWER(TRIM('Canal con espejo rÃ©flex'))
      ))
    OR
    (LOWER(TRIM(m.nombre_modelo)) = LOWER(TRIM('Mi Promo'))
      AND LOWER(TRIM(d.nombre_diseno)) = LOWER(TRIM('Bio Gloss'))
      AND LOWER(TRIM(m.presentacion)) IN (
        LOWER(TRIM('Superficie acrÃ­lica cristalina')),
        LOWER(TRIM('Esquinas espejo rÃ©flex'))
      ))
  )
  AND NOT EXISTS (
    SELECT 1 FROM contrato_detalles cd WHERE cd.id_modelo = m.id_modelo
  )
  AND NOT EXISTS (
    SELECT 1 FROM orden_detalles od WHERE od.id_modelo = m.id_modelo
  );

COMMIT;
