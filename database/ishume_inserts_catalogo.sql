-- ISHUME | INSERT INTO ... VALUES con claves primarias AUTO_INCREMENT
-- Ejecutar solamente en tablas VAC?AS (categorias, disenios, modelos).
-- MySQL genera las PK autom?ticamente; las FK num?ricas asumen tablas vac?as y AUTO_INCREMENT iniciando en 1.
-- No ejecutar tras cargar otros datos sin verificar posibles conflictos de IDs.
-- INICIAL y SUPERIOR: SUPERIOR agrupa primaria/secundaria/superior seg?n acuerdo del proyecto.
-- Cada combinaci?n nombre_modelo + id_diseno tiene su propio id_modelo.
-- Precio demostrativo en soles.
USE bd_ishume;

START TRANSACTION;

-- 1. CATEGOR?AS
INSERT INTO categorias (nombre_categoria) VALUES
    ('CUADROS'),
    ('ANUARIOS');

-- 2. DISE?OS
INSERT INTO disenios (id_categoria, nombre_diseno) VALUES
    (1, 'BIO GLOSS'),
    (1, 'BIO ACANALADOS'),
    (1, 'ENCAJONADO D LUJO'),
    (1, 'SUPER BIO MADERA'),
    (1, 'ACANALADOS'),
    (1, 'ENCAJONADO REFLEX'),
    (1, 'BIO MADERA'),
    (1, 'ELEGANCIA'),
    (1, 'BRILLANTE'),
    (1, 'SUPER BIO MADERA 3D'),
    (1, 'BIOMADERA 33 X 45'),
    (2, 'REFLEX'),
    (2, 'SECRET'),
    (2, 'PREMIUM'),
    (2, 'HOLOGRAFIADO');

-- 3. MODELOS (uno por combinaci?n de nombre y dise?o)
INSERT INTO modelos (id_diseno, nombre_modelo, nivel_educativo, precio) VALUES
    (1, 'AVENGERS', 'INICIAL', 57.00),
    (3, 'AVENGERS', 'INICIAL', 64.00),
    (1, 'UNICORNIO', 'INICIAL', 71.00),
    (4, 'UNICORNIO', 'INICIAL', 78.00),
    (2, 'ROBLOX HEROES', 'INICIAL', 85.00),
    (4, 'ROBLOX HEROES', 'INICIAL', 51.00),
    (2, 'GUERRERAS K – POP', 'INICIAL', 58.00),
    (3, 'GUERRERAS K – POP', 'INICIAL', 65.00),
    (4, 'GUERRERAS K – POP', 'INICIAL', 72.00),
    (3, 'MÁRMOL CELESTE', 'INICIAL', 79.00),
    (3, 'MÁRMOL ROSADO', 'INICIAL', 86.00),
    (3, 'PRINCESAS DISNEY', 'INICIAL', 52.00),
    (3, 'ROBLOX CABALLEROS', 'INICIAL', 59.00),
    (4, 'PRINCIPES HORIZONTAL', 'INICIAL', 66.00),
    (4, 'SPIDERMAN HEROES', 'INICIAL', 73.00),
    (4, 'BARBY UNICORNIO', 'INICIAL', 80.00),
    (4, 'PRINCIPES VERTICAL', 'INICIAL', 87.00),
    (1, 'MI PROMO', 'SUPERIOR', 53.00),
    (4, 'MI PROMO', 'SUPERIOR', 60.00),
    (5, 'MARAVILLAS ACADEMICO', 'SUPERIOR', 67.00),
    (3, 'MÁRMOL WHITE', 'SUPERIOR', 74.00),
    (3, 'MÁRMOL BLACK', 'SUPERIOR', 81.00),
    (6, 'RÉFLEX BLUE', 'SUPERIOR', 88.00),
    (6, 'RÉFLEX WHITE', 'SUPERIOR', 54.00),
    (4, 'BIO MÁRMOL WHITE', 'SUPERIOR', 61.00),
    (4, 'BIO MÁRMOL BLACK', 'SUPERIOR', 68.00),
    (4, 'ACADÉMICO', 'SUPERIOR', 75.00),
    (4, 'MI GRADUACION', 'SUPERIOR', 82.00),
    (7, 'WHITE', 'SUPERIOR', 89.00),
    (7, 'BLACK', 'SUPERIOR', 55.00),
    (8, 'PIEDRA SINTERIZADA ROSADA', 'INICIAL', 62.00),
    (8, 'PIEDRA SINTERIZADA AZUL', 'INICIAL', 69.00),
    (9, 'MI PRINCESA KPOP', 'INICIAL', 76.00),
    (10, 'MI PRINCESA KPOP', 'INICIAL', 83.00),
    (11, 'MI PRINCESA KPOP', 'INICIAL', 90.00),
    (9, 'MI PRÍNCIPE ROBLOX', 'INICIAL', 56.00),
    (10, 'MI PRÍNCIPE ROBLOX', 'INICIAL', 63.00),
    (11, 'MI PRÍNCIPE ROBLOX', 'INICIAL', 70.00),
    (9, 'BELLA PRINCESA', 'INICIAL', 77.00),
    (9, 'HÉROE GALAXY', 'INICIAL', 84.00),
    (10, 'HÉROE GALAXY', 'INICIAL', 50.00),
    (9, 'LILA PRINCESA', 'INICIAL', 57.00),
    (9, 'AZUL PRÍNCIPE', 'INICIAL', 64.00),
    (9, 'ROSADO PERLADO', 'INICIAL', 71.00),
    (9, 'AZUL ACERO', 'INICIAL', 78.00),
    (10, 'MI DULCE PRINCESA', 'INICIAL', 85.00),
    (8, 'PIEDRA SINTERIZADA BLANCA', 'SUPERIOR', 51.00),
    (8, 'PIEDRA SINTERIZADA NEGRO', 'SUPERIOR', 58.00),
    (9, 'SINTERIZADO BLANCO', 'SUPERIOR', 65.00),
    (10, 'SINTERIZADO BLANCO', 'SUPERIOR', 72.00),
    (9, 'SINTERIZADO NEGRO', 'SUPERIOR', 79.00),
    (10, 'SINTERIZADO NEGRO', 'SUPERIOR', 86.00),
    (11, 'SINTERIZADO NEGRO', 'SUPERIOR', 52.00),
    (9, 'MADERA GOLD', 'SUPERIOR', 59.00),
    (9, 'TEXTURA CUERO BEIGE', 'SUPERIOR', 66.00),
    (9, 'TEXTURA CUERO AZUL', 'SUPERIOR', 73.00),
    (9, 'DORADO', 'SUPERIOR', 80.00),
    (12, 'CUADRO DIAGON PINK', 'INICIAL', 87.00),
    (12, 'CUADRO DIAGON BLUE', 'INICIAL', 53.00),
    (13, 'CUADRO BOOK PINK', 'INICIAL', 60.00),
    (13, 'CUADRO BOOK BLUE', 'INICIAL', 67.00),
    (14, 'BOOK DIAGON PINK', 'INICIAL', 74.00),
    (14, 'BOOK DIAGON BLUE', 'INICIAL', 81.00),
    (15, 'BOOK WHITE PINK', 'INICIAL', 88.00),
    (15, 'BOOK WHITE BLUE', 'INICIAL', 54.00),
    (15, 'BOOK PREMIUM PINK', 'INICIAL', 61.00),
    (15, 'BOOK PREMIUM BLUE', 'INICIAL', 68.00),
    (12, 'CUADRO DIAGON BLACK', 'SUPERIOR', 75.00),
    (13, 'CUADRO BOOK BROWN', 'SUPERIOR', 82.00),
    (14, 'BOOK DIAGON BLACK', 'SUPERIOR', 89.00),
    (15, 'BOOK BLACK', 'SUPERIOR', 55.00),
    (15, 'BOOK WHITE', 'SUPERIOR', 62.00);

-- Ejecutar ishume_insert_proveedores.sql antes de estas relaciones.
-- Clasificacion aprobada usando el campo tipo del catalogo externo.
-- Proveedor IDs: LALO=1, Joselito=2, L?derBook=3 en una base recien reiniciada.
INSERT INTO disenio_proveedores (id_diseno, id_proveedor) VALUES
  (1, 2), (2, 2), (3, 2), (4, 2), (5, 2), (6, 2), (7, 2),
  (8, 1), (9, 1), (10, 1), (11, 1),
  (12, 3), (13, 3), (14, 3), (15, 3);

COMMIT;
