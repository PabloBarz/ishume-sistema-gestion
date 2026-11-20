-- Restaura los valores originales y el nombre de columna descripcion.
-- Ejecutar solo después del up correspondiente.
SET NAMES utf8mb4;

ALTER TABLE modelos DROP CHECK chk_modelos_nivel_educativo;

ALTER TABLE modelos
  CHANGE COLUMN presentacion descripcion VARCHAR(255) NULL;

UPDATE modelos m
JOIN _migration_20261119_nivel_modelos_backup b ON b.id_modelo = m.id_modelo
SET m.nivel_educativo = b.nivel_anterior;

DROP TABLE _migration_20261119_nivel_modelos_backup;
