-- Migra el catalogo existente a los dos niveles oficiales y renombra
-- modelos.descripcion a modelos.presentacion sin perder valores existentes.
-- Ejecutar una sola vez en bases que ya tienen la columna descripcion.
SET NAMES utf8mb4;

CREATE TABLE _migration_20261119_nivel_modelos_backup (
  id_modelo INT UNSIGNED NOT NULL PRIMARY KEY,
  nivel_anterior VARCHAR(30) NULL
) ENGINE=InnoDB;

INSERT INTO _migration_20261119_nivel_modelos_backup (id_modelo, nivel_anterior)
SELECT id_modelo, nivel_educativo
FROM modelos
WHERE nivel_educativo IN ('INICIAL', 'SUPERIOR', 'Primaria y Secundaria');

ALTER TABLE modelos
  CHANGE COLUMN descripcion presentacion VARCHAR(255) NULL;

UPDATE modelos
SET nivel_educativo = 'PRONOEI - Inicial'
WHERE nivel_educativo = 'INICIAL';

UPDATE modelos
SET nivel_educativo = 'Primaria - Superior'
WHERE nivel_educativo IN ('SUPERIOR', 'Primaria y Secundaria');

ALTER TABLE modelos
  ADD CONSTRAINT chk_modelos_nivel_educativo
  CHECK (nivel_educativo IS NULL OR nivel_educativo IN ('PRONOEI - Inicial', 'Primaria - Superior'));

-- Verificación: solo deben quedar estos dos valores (NULL se conserva si existía).
SELECT nivel_educativo, COUNT(*) AS total
FROM modelos
GROUP BY nivel_educativo
ORDER BY nivel_educativo;

-- La tabla _migration_..._backup se conserva para permitir rollback exacto.
