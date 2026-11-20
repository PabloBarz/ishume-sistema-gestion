-- CatÃ¡logo oficial: cinco modelos LÃ­derBook con imÃ¡genes verificadas.
-- Requiere ejecutar primero un respaldo completo de bd_ishume.
-- No asigna precios ni reutiliza IDs externos; MySQL genera IDs nuevos.
-- Resuelve proveedor y categorÃ­a por nombre. Los modelos heredan ambos del diseÃ±o.
USE bd_ishume;

ALTER TABLE modelos
  MODIFY nombre_modelo VARCHAR(60) NOT NULL,
  MODIFY precio DECIMAL(10,2) NULL DEFAULT NULL;

START TRANSACTION;

-- En la base objetivo no existÃ­a un diseÃ±o Book para LÃ­derBook/Anuarios.
INSERT INTO disenios (id_categoria, id_proveedor, nombre_diseno, estado)
SELECT c.id_categoria, p.id_proveedor, 'Book', 1
FROM categorias c
JOIN proveedores p ON LOWER(TRIM(p.razon_social)) IN ('liderbook', 'lÃ­derbook')
WHERE UPPER(TRIM(c.nombre_categoria)) = 'ANUARIOS'
  AND c.estado = 1
  AND p.estado = 'Activo'
  AND NOT EXISTS (
    SELECT 1 FROM disenios d
    WHERE d.id_categoria = c.id_categoria
      AND d.id_proveedor = p.id_proveedor
      AND LOWER(TRIM(d.nombre_diseno)) = 'book'
  );

INSERT INTO modelos
  (id_diseno, imagen_path, nombre_modelo, presentacion, nivel_educativo, precio, estado)
SELECT d.id_diseno, x.imagen_path, x.nombre_modelo, NULL, x.nivel_educativo, NULL, 1
FROM (
  SELECT '/uploads/modelos/30da1e93-06a3-4d1c-9eb5-3398e2f0f4a6.png' AS imagen_path,
         'Book Giratorio Negro' AS nombre_modelo, 'Primaria - Superior' AS nivel_educativo
  UNION ALL SELECT '/uploads/modelos/9a785bad-634e-4aed-866c-58e7b959d00d.png',
         'Book Giratorio Rosado', 'PRONOEI - Inicial'
  UNION ALL SELECT '/uploads/modelos/45b7b50b-1e23-4a9c-9d4e-9d3deb0b5e79.png',
         'Book Giratorio Azul', 'PRONOEI - Inicial'
  UNION ALL SELECT '/uploads/modelos/b930c050-de97-486d-89cf-eeb3a5dc8f99.png',
         'Cuadro Book Secret Giratorio Lila', 'PRONOEI - Inicial'
  UNION ALL SELECT '/uploads/modelos/e3ef39f0-832d-46f2-8b66-439e9b1d70d1.png',
         'Cuadro Book Secret Giratorio Azul', 'PRONOEI - Inicial'
) x
JOIN disenios d ON LOWER(TRIM(d.nombre_diseno)) = 'book' AND d.estado = 1
JOIN categorias c ON c.id_categoria = d.id_categoria AND UPPER(TRIM(c.nombre_categoria)) = 'ANUARIOS' AND c.estado = 1
JOIN proveedores p ON p.id_proveedor = d.id_proveedor
  AND LOWER(TRIM(p.razon_social)) IN ('liderbook', 'lÃ­derbook') AND p.estado = 'Activo'
WHERE NOT EXISTS (
  SELECT 1 FROM modelos existing
  WHERE LOWER(TRIM(existing.nombre_modelo)) = LOWER(TRIM(x.nombre_modelo))
);

COMMIT;

-- VerificaciÃ³n posterior: deben aparecer cinco filas activas con precio NULL.
SELECT m.id_modelo, m.nombre_modelo, m.nivel_educativo, m.precio,
       m.imagen_path, c.nombre_categoria, d.nombre_diseno, p.razon_social AS nombre_proveedor
FROM modelos m
JOIN disenios d ON d.id_diseno = m.id_diseno
JOIN categorias c ON c.id_categoria = d.id_categoria
JOIN proveedores p ON p.id_proveedor = d.id_proveedor
WHERE m.imagen_path IN (
  '/uploads/modelos/30da1e93-06a3-4d1c-9eb5-3398e2f0f4a6.png',
  '/uploads/modelos/9a785bad-634e-4aed-866c-58e7b959d00d.png',
  '/uploads/modelos/45b7b50b-1e23-4a9c-9d4e-9d3deb0b5e79.png',
  '/uploads/modelos/b930c050-de97-486d-89cf-eeb3a5dc8f99.png',
  '/uploads/modelos/e3ef39f0-832d-46f2-8b66-439e9b1d70d1.png'
)
ORDER BY m.id_modelo;
