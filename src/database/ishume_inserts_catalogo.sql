-- ISHUME | INSERT INTO ... VALUES con claves primarias AUTO_INCREMENT
-- Ejecutar solamente en tablas VACÍAS (categorias, disenios, modelos).
-- MySQL genera las PK automáticamente; las FK numéricas asumen tablas vacías y AUTO_INCREMENT iniciando en 1.
-- No ejecutar tras cargar otros datos sin verificar posibles conflictos de IDs.
-- INICIAL y SUPERIOR: SUPERIOR agrupa primaria/secundaria/superior según acuerdo del proyecto.
-- Cada combinación nombre_modelo + id_diseno tiene su propio id_modelo.
-- Este archivo no incluye inventario_productos ni proveedores.
USE ishume_gestion;

START TRANSACTION;

-- 1. CATEGORÍAS
INSERT INTO categorias (nombre_categoria) VALUES
    ('CUADROS'),
    ('ANUARIOS');

-- 2. DISEÑOS
INSERT INTO disenios (id_categoria, nombre_diseno, descripcion) VALUES
    (1, 'BIO GLOSS', NULL),
    (1, 'BIO ACANALADOS', NULL),
    (1, 'ENCAJONADO D LUJO', NULL),
    (1, 'SUPER BIO MADERA', NULL),
    (1, 'ACANALADOS', NULL),
    (1, 'ENCAJONADO REFLEX', NULL),
    (1, 'BIO MADERA', NULL),
    (1, 'ELEGANCIA', NULL),
    (1, 'BRILLANTE', NULL),
    (1, 'SUPER BIO MADERA 3D', NULL),
    (1, 'BIOMADERA 33 X 45', NULL),
    (2, 'REFLEX', NULL),
    (2, 'SECRET', NULL),
    (2, 'PREMIUM', NULL),
    (2, 'HOLOGRAFIADO', NULL);

-- 3. MODELOS (uno por combinación de nombre y diseño)
INSERT INTO modelos (id_diseno, nombre_modelo, nivel_educativo) VALUES
    (1, 'AVENGERS', 'INICIAL'),
    (3, 'AVENGERS', 'INICIAL'),
    (1, 'UNICORNIO', 'INICIAL'),
    (4, 'UNICORNIO', 'INICIAL'),
    (2, 'ROBLOX HEROES', 'INICIAL'),
    (4, 'ROBLOX HEROES', 'INICIAL'),
    (2, 'GUERRERAS K – POP', 'INICIAL'),
    (3, 'GUERRERAS K – POP', 'INICIAL'),
    (4, 'GUERRERAS K – POP', 'INICIAL'),
    (3, 'MÁRMOL CELESTE', 'INICIAL'),
    (3, 'MÁRMOL ROSADO', 'INICIAL'),
    (3, 'PRINCESAS DISNEY', 'INICIAL'),
    (3, 'ROBLOX CABALLEROS', 'INICIAL'),
    (4, 'PRINCIPES HORIZONTAL', 'INICIAL'),
    (4, 'SPIDERMAN HEROES', 'INICIAL'),
    (4, 'BARBY UNICORNIO', 'INICIAL'),
    (4, 'PRINCIPES VERTICAL', 'INICIAL'),
    (1, 'MI PROMO', 'SUPERIOR'),
    (4, 'MI PROMO', 'SUPERIOR'),
    (5, 'MARAVILLAS ACADEMICO', 'SUPERIOR'),
    (3, 'MÁRMOL WHITE', 'SUPERIOR'),
    (3, 'MÁRMOL BLACK', 'SUPERIOR'),
    (6, 'RÉFLEX BLUE', 'SUPERIOR'),
    (6, 'RÉFLEX WHITE', 'SUPERIOR'),
    (4, 'BIO MÁRMOL WHITE', 'SUPERIOR'),
    (4, 'BIO MÁRMOL BLACK', 'SUPERIOR'),
    (4, 'ACADÉMICO', 'SUPERIOR'),
    (4, 'MI GRADUACION', 'SUPERIOR'),
    (7, 'WHITE', 'SUPERIOR'),
    (7, 'BLACK', 'SUPERIOR'),
    (8, 'PIEDRA SINTERIZADA ROSADA', 'INICIAL'),
    (8, 'PIEDRA SINTERIZADA AZUL', 'INICIAL'),
    (9, 'MI PRINCESA KPOP', 'INICIAL'),
    (10, 'MI PRINCESA KPOP', 'INICIAL'),
    (11, 'MI PRINCESA KPOP', 'INICIAL'),
    (9, 'MI PRÍNCIPE ROBLOX', 'INICIAL'),
    (10, 'MI PRÍNCIPE ROBLOX', 'INICIAL'),
    (11, 'MI PRÍNCIPE ROBLOX', 'INICIAL'),
    (9, 'BELLA PRINCESA', 'INICIAL'),
    (9, 'HÉROE GALAXY', 'INICIAL'),
    (10, 'HÉROE GALAXY', 'INICIAL'),
    (9, 'LILA PRINCESA', 'INICIAL'),
    (9, 'AZUL PRÍNCIPE', 'INICIAL'),
    (9, 'ROSADO PERLADO', 'INICIAL'),
    (9, 'AZUL ACERO', 'INICIAL'),
    (10, 'MI DULCE PRINCESA', 'INICIAL'),
    (8, 'PIEDRA SINTERIZADA BLANCA', 'SUPERIOR'),
    (8, 'PIEDRA SINTERIZADA NEGRO', 'SUPERIOR'),
    (9, 'SINTERIZADO BLANCO', 'SUPERIOR'),
    (10, 'SINTERIZADO BLANCO', 'SUPERIOR'),
    (9, 'SINTERIZADO NEGRO', 'SUPERIOR'),
    (10, 'SINTERIZADO NEGRO', 'SUPERIOR'),
    (11, 'SINTERIZADO NEGRO', 'SUPERIOR'),
    (9, 'MADERA GOLD', 'SUPERIOR'),
    (9, 'TEXTURA CUERO BEIGE', 'SUPERIOR'),
    (9, 'TEXTURA CUERO AZUL', 'SUPERIOR'),
    (9, 'DORADO', 'SUPERIOR'),
    (12, 'CUADRO DIAGON PINK', 'INICIAL'),
    (12, 'CUADRO DIAGON BLUE', 'INICIAL'),
    (13, 'CUADRO BOOK PINK', 'INICIAL'),
    (13, 'CUADRO BOOK BLUE', 'INICIAL'),
    (14, 'BOOK DIAGON PINK', 'INICIAL'),
    (14, 'BOOK DIAGON BLUE', 'INICIAL'),
    (15, 'BOOK WHITE PINK', 'INICIAL'),
    (15, 'BOOK WHITE BLUE', 'INICIAL'),
    (15, 'BOOK PREMIUM PINK', 'INICIAL'),
    (15, 'BOOK PREMIUM BLUE', 'INICIAL'),
    (12, 'CUADRO DIAGON BLACK', 'SUPERIOR'),
    (13, 'CUADRO BOOK BROWN', 'SUPERIOR'),
    (14, 'BOOK DIAGON BLACK', 'SUPERIOR'),
    (15, 'BOOK BLACK', 'SUPERIOR'),
    (15, 'BOOK WHITE', 'SUPERIOR'),
    (15, 'BOOK PREMIUM', 'SUPERIOR');

COMMIT;
