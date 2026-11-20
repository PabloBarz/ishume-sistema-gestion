-- Reversión de 20261118_catalogo_giratorios_up.sql.
-- Ejecutar solo si el SELECT de dependencias siguiente devuelve 0 filas y
-- el SELECT de bloqueos de esquema devuelve 0. No borra contratos ni órdenes.
USE bd_ishume;

-- 1) Preflight: los modelos nuevos no deben estar referenciados por compras.
SELECT m.id_modelo, m.nombre_modelo,
       EXISTS (SELECT 1 FROM contrato_detalles cd WHERE cd.id_modelo = m.id_modelo) AS usado_en_contratos,
       EXISTS (SELECT 1 FROM orden_detalles od WHERE od.id_modelo = m.id_modelo) AS usado_en_ordenes
FROM modelos m
WHERE m.imagen_path IN (
  '/uploads/modelos/30da1e93-06a3-4d1c-9eb5-3398e2f0f4a6.png',
  '/uploads/modelos/9a785bad-634e-4aed-866c-58e7b959d00d.png',
  '/uploads/modelos/45b7b50b-1e23-4a9c-9d4e-9d3deb0b5e79.png',
  '/uploads/modelos/b930c050-de97-486d-89cf-eeb3a5dc8f99.png',
  '/uploads/modelos/e3ef39f0-832d-46f2-8b66-439e9b1d70d1.png'
);

-- 2) Preflight: después de eliminar los cinco modelos, no debe quedar ningún
-- precio NULL ni nombre de más de 30 caracteres antes de restaurar el esquema.
SELECT id_modelo, nombre_modelo, precio
FROM modelos
WHERE (precio IS NULL OR CHAR_LENGTH(nombre_modelo) > 30)
  AND COALESCE(imagen_path, '') NOT IN (
    '/uploads/modelos/30da1e93-06a3-4d1c-9eb5-3398e2f0f4a6.png',
    '/uploads/modelos/9a785bad-634e-4aed-866c-58e7b959d00d.png',
    '/uploads/modelos/45b7b50b-1e23-4a9c-9d4e-9d3deb0b5e79.png',
    '/uploads/modelos/b930c050-de97-486d-89cf-eeb3a5dc8f99.png',
    '/uploads/modelos/e3ef39f0-832d-46f2-8b66-439e9b1d70d1.png'
  );

-- Si el primer preflight está limpio, ejecutar el bloque de reversión. La
-- ampliación de columnas es retrocompatible; su reversión está separada en
-- 20261118_catalogo_giratorios_down_esquema.sql para proteger otros modelos.
START TRANSACTION;
DELETE m FROM modelos m
WHERE m.imagen_path IN (
  '/uploads/modelos/30da1e93-06a3-4d1c-9eb5-3398e2f0f4a6.png',
  '/uploads/modelos/9a785bad-634e-4aed-866c-58e7b959d00d.png',
  '/uploads/modelos/45b7b50b-1e23-4a9c-9d4e-9d3deb0b5e79.png',
  '/uploads/modelos/b930c050-de97-486d-89cf-eeb3a5dc8f99.png',
  '/uploads/modelos/e3ef39f0-832d-46f2-8b66-439e9b1d70d1.png'
)
AND NOT EXISTS (SELECT 1 FROM contrato_detalles cd WHERE cd.id_modelo = m.id_modelo)
AND NOT EXISTS (SELECT 1 FROM orden_detalles od WHERE od.id_modelo = m.id_modelo);

DELETE d FROM disenios d
JOIN categorias c ON c.id_categoria = d.id_categoria AND UPPER(TRIM(c.nombre_categoria)) = 'ANUARIOS'
JOIN proveedores p ON p.id_proveedor = d.id_proveedor AND LOWER(TRIM(p.razon_social)) IN ('liderbook', 'líderbook')
WHERE LOWER(TRIM(d.nombre_diseno)) = 'book'
  AND NOT EXISTS (SELECT 1 FROM modelos m WHERE m.id_diseno = d.id_diseno);
COMMIT;
