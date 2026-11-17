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
INSERT INTO disenios (id_categoria, id_proveedor, nombre_diseno) VALUES
    (1, 2, 'BIO GLOSS'),
    (1, 2, 'BIO ACANALADOS'),
    (1, 2, 'ENCAJONADO D LUJO'),
    (1, 2, 'SUPER BIO MADERA'),
    (1, 2, 'ACANALADOS'),
    (1, 2, 'ENCAJONADO REFLEX'),
    (1, 2, 'BIO MADERA'),
    (1, 1, 'ELEGANCIA'),
    (1, 1, 'BRILLANTE'),
    (1, 1, 'SUPER BIO MADERA 3D'),
    (1, 1, 'BIOMADERA 33 X 45'),
    (2, 3, 'REFLEX'),
    (2, 3, 'SECRET'),
    (2, 3, 'PREMIUM'),
    (2, 3, 'HOLOGRAFIADO');

-- 3. MODELOS (uno por combinaci?n de nombre y dise?o)
INSERT INTO modelos (id_diseno, nombre_modelo, nivel_educativo, precio, imagen_path) VALUES
    (1, 'AVENGERS', 'INICIAL', 57.00, '/uploads/modelos/627a76d9-bf06-4f6f-be53-09a8b873a89f.png'),
    (3, 'AVENGERS', 'INICIAL', 64.00, '/uploads/modelos/93107c48-87a6-4da7-8178-8cdd483187b8.png'),
    (1, 'UNICORNIO', 'INICIAL', 71.00, '/uploads/modelos/7f65d735-1390-4f0a-a131-6eccc3934d2c.png'),
    (4, 'UNICORNIO HORIZONTAL', 'INICIAL', 78.00, '/uploads/modelos/2b1871fd-5e72-4d4b-8d25-1cb5aa8c4e52.png'),
    (4, 'UNICORNIO VERTICAL', 'INICIAL', 80.00, '/uploads/modelos/083c80ad-db29-4e9a-939d-4f0ab37f6531.png'),
    (2, 'ROBLOX HEROES', 'INICIAL', 85.00, '/uploads/modelos/76263161-d451-4e8a-821d-9cd04345f5b3.png'),
    (4, 'ROBLOX HEROES', 'INICIAL', 51.00, '/uploads/modelos/e5170b35-eb54-4e8c-ad4d-9915786aa6b5.png'),
    (2, 'GUERRERAS K – POP', 'INICIAL', 58.00, '/uploads/modelos/e87438e8-21c0-467f-9a77-166949e39506.png'),
    (3, 'GUERRERAS K – POP', 'INICIAL', 65.00, '/uploads/modelos/27ee74a0-5d18-4b98-9407-3f976afa80d6.png'),
    (4, 'GUERRERAS K – POP', 'INICIAL', 72.00, '/uploads/modelos/3d570ce1-c250-4156-8b5c-fff29d2839e8.png'),
    (3, 'MÁRMOL CELESTE', 'INICIAL', 79.00, '/uploads/modelos/f0ef3a38-0704-4e2b-8ff7-d967a39839ae.png'),
    (3, 'MÁRMOL ROSADO', 'INICIAL', 86.00, '/uploads/modelos/30eb3767-493f-4fce-b780-0046e724ff3f.png'),
    (3, 'PRINCESAS DISNEY', 'INICIAL', 52.00, '/uploads/modelos/cfddcae5-7bc0-4b2e-9e7e-3950beba7c23.png'),
    (3, 'ROBLOX CABALLEROS', 'INICIAL', 59.00, '/uploads/modelos/170c529f-bf34-4a22-b3ee-800403a5dacf.png'),
    (4, 'PRINCIPES HORIZONTAL', 'INICIAL', 66.00, '/uploads/modelos/9cb31142-fc23-4055-9ecb-1be1939685d4.png'),
    (4, 'SPIDERMAN HEROES', 'INICIAL', 73.00, '/uploads/modelos/429699d9-28b5-41e9-a45b-8bac8eadd912.png'),
    (4, 'BARBY UNICORNIO', 'INICIAL', 80.00, '/uploads/modelos/b3f8983c-28fb-425c-9542-86231b6097b4.png'),
    (4, 'PRINCIPES VERTICAL', 'INICIAL', 87.00, '/uploads/modelos/412a2a86-f61b-4525-a061-9954ded785eb.png'),
    (1, 'MI PROMO', 'SUPERIOR', 53.00, '/uploads/modelos/265a21bd-1687-4741-bf91-42f9a973979d.png'),
    (4, 'MI PROMO', 'SUPERIOR', 60.00, '/uploads/modelos/3eb0b8df-008d-4fe5-afba-0e26abbb36b5.png'),
    (5, 'MARAVILLAS ACADEMICO', 'SUPERIOR', 67.00, '/uploads/modelos/8ef47652-c566-4740-b100-fbe47956a6c7.png'),
    (3, 'MÁRMOL WHITE', 'SUPERIOR', 74.00, '/uploads/modelos/98a42511-b782-4832-a563-a7d70a301952.png'),
    (3, 'MÁRMOL BLACK', 'SUPERIOR', 81.00, '/uploads/modelos/77c767b1-0274-4e0a-bb1e-10b143750fe4.png'),
    (6, 'RÉFLEX BLUE', 'SUPERIOR', 88.00, '/uploads/modelos/934c803c-c73d-44fb-bb42-be266606b35a.png'),
    (6, 'RÉFLEX WHITE', 'SUPERIOR', 54.00, '/uploads/modelos/0fe9ab24-ff20-4933-805d-eab175f22f27.png'),
    (4, 'BIO MÁRMOL WHITE', 'SUPERIOR', 61.00, '/uploads/modelos/be2dc938-86f5-4bb2-b0f8-09f1c07efd32.png'),
    (4, 'BIO MÁRMOL BLACK', 'SUPERIOR', 68.00, '/uploads/modelos/10c44110-9104-4c14-952f-b6be60993fbd.png'),
    (4, 'ACADÉMICO', 'SUPERIOR', 75.00, '/uploads/modelos/495dad24-0867-40bc-8de7-d3ae2028a4cc.png'),
    (4, 'MI GRADUACION', 'SUPERIOR', 82.00, '/uploads/modelos/ba55b733-705d-43b0-a833-77793280be9b.png'),
    (7, 'WHITE', 'SUPERIOR', 89.00, '/uploads/modelos/764a0a58-7def-431f-b641-60be10cdc7b9.png'),
    (7, 'BLACK', 'SUPERIOR', 55.00, '/uploads/modelos/7bbb617b-dd04-41cd-b2e1-dd20c9189edd.png'),
    (8, 'PIEDRA SINTERIZADA ROSADA', 'INICIAL', 62.00, '/uploads/modelos/1f68e1a0-49dc-4cf5-9f9f-255bca51e3d7.png'),
    (8, 'PIEDRA SINTERIZADA AZUL', 'INICIAL', 69.00, '/uploads/modelos/57141c91-28eb-47e3-a5b2-5192b93f797a.png'),
    (9, 'MI PRINCESA KPOP', 'INICIAL', 76.00, '/uploads/modelos/5b58ebc4-6e9d-40ff-a583-98bb1a14cc6d.png'),
    (10, 'MI PRINCESA KPOP', 'INICIAL', 83.00, '/uploads/modelos/b042cdcf-1106-43af-8600-a482fd234c9c.png'),
    (11, 'MI PRINCESA KPOP', 'INICIAL', 90.00, '/uploads/modelos/53b362d2-79ad-4c37-bf41-d61a561d30e6.png'),
    (9, 'MI PRÍNCIPE ROBLOX', 'INICIAL', 56.00, '/uploads/modelos/2a9f2c56-a37a-456c-a4a6-bdb72b100200.png'),
    (10, 'MI PRÍNCIPE ROBLOX', 'INICIAL', 63.00, '/uploads/modelos/5865a6a8-0629-4b39-9f6a-c2a78b14bee6.png'),
    (11, 'MI PRÍNCIPE ROBLOX', 'INICIAL', 70.00, '/uploads/modelos/af1023ad-6217-4310-92bd-5b32c8f52f64.png'),
    (9, 'BELLA PRINCESA', 'INICIAL', 77.00, '/uploads/modelos/6684435e-81ec-47fb-b983-91b986411057.png'),
    (9, 'HÉROE GALAXY', 'INICIAL', 84.00, '/uploads/modelos/398369c3-72cb-4bb5-823c-5b384a1a746e.png'),
    (10, 'HÉROE GALAXY', 'INICIAL', 50.00, '/uploads/modelos/6fb4063f-a2e3-4685-b6d3-94420e97aeed.png'),
    (9, 'LILA PRINCESA', 'INICIAL', 57.00, '/uploads/modelos/dcc6f8b2-c5fe-4d2e-a705-8c8dfdfd56ac.png'),
    (9, 'AZUL PRÍNCIPE', 'INICIAL', 64.00, '/uploads/modelos/ff347d76-9e85-4275-a11f-ce6590b02ae7.png'),
    (9, 'ROSADO PERLADO', 'INICIAL', 71.00, '/uploads/modelos/ec718eef-dd6f-40ea-8d51-62fedea09fb8.png'),
    (9, 'AZUL ACERO', 'INICIAL', 78.00, '/uploads/modelos/63758fc7-b4a4-424e-98dc-cf3fe045710f.png'),
    (10, 'MI DULCE PRINCESA', 'INICIAL', 85.00, '/uploads/modelos/8d9b70db-9e62-4a1f-a658-220a15ab038b.png'),
    (8, 'PIEDRA SINTERIZADA BLANCA', 'SUPERIOR', 51.00, '/uploads/modelos/14213035-3376-454e-a7c2-2b69831a6946.png'),
    (8, 'PIEDRA SINTERIZADA NEGRO', 'SUPERIOR', 58.00, '/uploads/modelos/ef5a795d-0ad8-4e6f-8437-a20c34cc5949.png'),
    (9, 'SINTERIZADO BLANCO', 'SUPERIOR', 65.00, '/uploads/modelos/f01d00f3-3d0b-44b2-af30-0689776b1985.png'),
    (10, 'SINTERIZADO BLANCO', 'SUPERIOR', 72.00, '/uploads/modelos/29f9edf1-d91d-4c9c-917a-c3aea0e86ed4.png'),
    (9, 'SINTERIZADO NEGRO', 'SUPERIOR', 79.00, '/uploads/modelos/92dced36-7061-49d6-989b-f172cc2d64b3.png'),
    (10, 'SINTERIZADO NEGRO', 'SUPERIOR', 86.00, '/uploads/modelos/3b1ba66d-5dec-4a93-87d0-53977fffc5a9.png'),
    (11, 'SINTERIZADO NEGRO', 'SUPERIOR', 52.00, '/uploads/modelos/729a85a9-19d8-4335-9b83-915fe9ba4f91.png'),
    (9, 'MADERA GOLD', 'SUPERIOR', 59.00, '/uploads/modelos/e53bfe27-f586-4263-b014-44860573d191.png'),
    (9, 'TEXTURA CUERO BEIGE', 'SUPERIOR', 66.00, '/uploads/modelos/04591905-0df0-4275-9ae9-7f80f1f05908.png'),
    (9, 'TEXTURA CUERO AZUL', 'SUPERIOR', 73.00, '/uploads/modelos/912a10b9-4cec-43f5-9f77-48cdf8bd47a6.png'),
    (9, 'DORADO', 'SUPERIOR', 80.00, '/uploads/modelos/9d82fb1f-46a3-4d9e-9b31-ad046f7e2794.png'),
    (12, 'CUADRO DIAGON PINK', 'INICIAL', 87.00, '/uploads/modelos/311cb08b-1eab-480a-bc18-0e96735374e8.png'),
    (12, 'CUADRO DIAGON BLUE', 'INICIAL', 53.00, '/uploads/modelos/8651d06c-d440-4195-b97f-e0bb14510da9.png'),
    (13, 'CUADRO BOOK PINK', 'INICIAL', 60.00, '/uploads/modelos/23817c2e-1f5c-4b38-9f12-3793347e77ae.png'),
    (13, 'CUADRO BOOK BLUE', 'INICIAL', 67.00, '/uploads/modelos/40de5692-db3a-48ee-837d-62a99be02020.png'),
    (14, 'BOOK DIAGON PINK', 'INICIAL', 74.00, '/uploads/modelos/16b17898-38b4-4ad0-8256-011bade0ba0c.png'),
    (14, 'BOOK DIAGON BLUE', 'INICIAL', 81.00, '/uploads/modelos/7c1412a0-9431-4d62-a684-791f6da271bc.png'),
    (15, 'BOOK WHITE PINK', 'INICIAL', 88.00, '/uploads/modelos/de75dd15-c4e8-4f7c-96f3-08fa07b6d6b8.png'),
    (15, 'BOOK WHITE BLUE', 'INICIAL', 54.00, '/uploads/modelos/4eeee1eb-06e4-4cc0-b05a-d6890b6fa44a.png'),
    (15, 'BOOK PREMIUM PINK', 'INICIAL', 61.00, '/uploads/modelos/1d57324c-1607-4d15-81ec-4d4848e85b14.png'),
    (15, 'BOOK PREMIUM BLUE', 'INICIAL', 68.00, '/uploads/modelos/43084b66-d546-4b8c-8f4f-a9ec26ead6fb.png'),
    (12, 'CUADRO DIAGON BLACK', 'SUPERIOR', 75.00, '/uploads/modelos/bc839df7-3af2-4c76-848f-d6e71e7208f8.png'),
    (13, 'CUADRO BOOK BROWN', 'SUPERIOR', 82.00, '/uploads/modelos/a724866c-8050-49f6-9763-f7e715bfd7e1.png'),
    (14, 'BOOK DIAGON BLACK', 'SUPERIOR', 89.00, '/uploads/modelos/5e49f0e7-6c01-44cb-89dc-9d28b591c8a4.png'),
    (15, 'BOOK BLACK', 'SUPERIOR', 55.00, '/uploads/modelos/33150b2c-b215-4fe1-b376-9a8fec00ca27.png'),
    (15, 'BOOK WHITE', 'SUPERIOR', 62.00, '/uploads/modelos/8d285015-953b-451f-80bc-c069b8bb81bf.png'),
    (15, 'BOOK PREMIUM', 'SUPERIOR', 65.00, '/uploads/modelos/622e89c7-4b2e-42c7-afc5-32b421ad14c8.png');


-- Ejecutar ishume_insert_proveedores.sql antes de cargar los disenos.
-- Clasificacion aprobada usando el campo tipo del catalogo externo.
-- Proveedor IDs esperados en una base recien reiniciada: LALO=1, Joselito=2, LiderBook=3.

COMMIT;
