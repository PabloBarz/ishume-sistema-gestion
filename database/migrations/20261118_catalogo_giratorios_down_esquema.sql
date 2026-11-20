-- Reversión opcional de la ampliación de columnas.
-- Ejecutar solo después de down.sql y únicamente si esta consulta devuelve 0 filas.
USE bd_ishume;

SELECT id_modelo, nombre_modelo, precio
FROM modelos
WHERE precio IS NULL OR CHAR_LENGTH(nombre_modelo) > 30;

-- No ejecutar si el SELECT anterior devuelve alguna fila. Esta comprobación
-- evita eliminar precios pendientes o truncar nombres agregados posteriormente.
ALTER TABLE modelos
  MODIFY nombre_modelo VARCHAR(30) NOT NULL,
  MODIFY precio DECIMAL(10,2) NOT NULL DEFAULT 0.00;
