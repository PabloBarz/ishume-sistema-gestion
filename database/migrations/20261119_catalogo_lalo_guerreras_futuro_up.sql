-- Agrega el diseÃ±o Resinado y el modelo Guerreras del futuro al catÃ¡logo LALO.
-- Requiere la categorÃ­a CUADROS y el proveedor LALO existentes.
-- El precio queda NULL hasta que LALO confirme el precio oficial.
SET NAMES utf8mb4;
START TRANSACTION;

INSERT INTO disenios (id_categoria, id_proveedor, nombre_diseno, estado)
SELECT c.id_categoria, p.id_proveedor, 'RESINADO', 1
FROM categorias c
JOIN proveedores p ON p.razon_social = 'LALO'
WHERE c.nombre_categoria = 'CUADROS'
  AND NOT EXISTS (
    SELECT 1 FROM disenios d
    WHERE d.id_categoria = c.id_categoria
      AND d.id_proveedor = p.id_proveedor
      AND LOWER(d.nombre_diseno) = 'resinado'
  );

INSERT INTO modelos (id_diseno, imagen_path, nombre_modelo, presentacion, nivel_educativo, precio, estado)
SELECT d.id_diseno,
       '/uploads/modelos/521f2be8-67f6-4fe1-8428-c9c6eb15752b.png',
       'Guerreras del futuro', NULL, 'PRONOEI - Inicial', NULL, 1
FROM disenios d
JOIN categorias c ON c.id_categoria = d.id_categoria
JOIN proveedores p ON p.id_proveedor = d.id_proveedor
WHERE c.nombre_categoria = 'CUADROS'
  AND p.razon_social = 'LALO'
  AND LOWER(d.nombre_diseno) = 'resinado'
  AND NOT EXISTS (
    SELECT 1 FROM modelos m
    WHERE m.id_diseno = d.id_diseno
      AND LOWER(m.nombre_modelo) = 'guerreras del futuro'
      AND m.nivel_educativo = 'PRONOEI - Inicial'
  );

COMMIT;

-- Debe devolver exactamente el nuevo modelo con proveedor LALO y diseÃ±o RESINADO.
SELECT m.id_modelo, m.nombre_modelo, m.nivel_educativo, m.precio, m.estado,
       d.nombre_diseno, c.nombre_categoria, p.razon_social AS nombre_proveedor,
       m.imagen_path
FROM modelos m
JOIN disenios d ON d.id_diseno = m.id_diseno
JOIN categorias c ON c.id_categoria = d.id_categoria
JOIN proveedores p ON p.id_proveedor = d.id_proveedor
WHERE m.imagen_path = '/uploads/modelos/521f2be8-67f6-4fe1-8428-c9c6eb15752b.png';
