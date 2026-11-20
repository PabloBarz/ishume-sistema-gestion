-- Restaura los dos registros genÃ©ricos de Joselito con su ID local original.
-- Los deja inactivos, como estaban justo antes de eliminarlos.
SET NAMES utf8mb4;

INSERT INTO modelos
  (id_modelo, id_diseno, imagen_path, nombre_modelo, presentacion, nivel_educativo, precio, estado)
SELECT 19, d.id_diseno,
       '/uploads/modelos/265a21bd-1687-4741-bf91-42f9a973979d.png',
       'MI PROMO', NULL, 'Primaria - Superior', 53.00, 0
FROM disenios d
JOIN categorias c ON c.id_categoria = d.id_categoria
JOIN proveedores p ON p.id_proveedor = d.id_proveedor
WHERE c.nombre_categoria = 'CUADROS'
  AND p.razon_social = 'Joselito'
  AND d.nombre_diseno = 'BIO GLOSS'
  AND NOT EXISTS (SELECT 1 FROM modelos WHERE id_modelo = 19);

INSERT INTO modelos
  (id_modelo, id_diseno, imagen_path, nombre_modelo, presentacion, nivel_educativo, precio, estado)
SELECT 21, d.id_diseno,
       '/uploads/modelos/8ef47652-c566-4740-b100-fbe47956a6c7.png',
       'MARAVILLAS ACADEMICO', NULL, 'Primaria - Superior', 67.00, 0
FROM disenios d
JOIN categorias c ON c.id_categoria = d.id_categoria
JOIN proveedores p ON p.id_proveedor = d.id_proveedor
WHERE c.nombre_categoria = 'CUADROS'
  AND p.razon_social = 'Joselito'
  AND d.nombre_diseno = 'ACANALADOS'
  AND NOT EXISTS (SELECT 1 FROM modelos WHERE id_modelo = 21);
