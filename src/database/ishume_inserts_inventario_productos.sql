-- ISHUME: datos DEMOSTRATIVOS de inventario (73 productos)
-- Requiere haber ejecutado ishume_inserts_auto_increment.sql
-- y que los modelos tengan IDs consecutivos 1 a 73, sin registros previos.
-- No ejecutar dos veces: sku tiene restriccion UNIQUE.
-- Cada SKU identifica categoria, modelo, diseno, nivel y consecutivo.
-- CUA=cuadros; ANU=anuarios; I=inicial; S=superior.
-- Los colores se identifican cuando forman parte del nombre del modelo.
-- Precio de referencia SIMULADO entre S/ 50.00 y S/ 90.00.
-- Stock SIMULADO entre 10 y 25 unidades.
USE ishume_gestion;

INSERT INTO inventario_productos (id_modelo, sku, precio, stock_actual)
VALUES
    (1, 'CUA-AVE-BGL-I-001', 57.00, 15),
    (2, 'CUA-AVE-EDL-I-002', 64.00, 20),
    (3, 'CUA-UNI-BGL-I-003', 71.00, 25),
    (4, 'CUA-UNI-SBM-I-004', 78.00, 14),
    (5, 'CUA-ROB-HER-BAC-I-005', 85.00, 19),
    (6, 'CUA-ROB-HER-SBM-I-006', 51.00, 24),
    (7, 'CUA-GUE-K-POP-BAC-I-007', 58.00, 13),
    (8, 'CUA-GUE-K-POP-EDL-I-008', 65.00, 18),
    (9, 'CUA-GUE-K-POP-SBM-I-009', 72.00, 23),
    (10, 'CUA-MAR-CEL-EDL-I-010', 79.00, 12),
    (11, 'CUA-MAR-ROS-EDL-I-011', 86.00, 17),
    (12, 'CUA-PRI-DIS-EDL-I-012', 52.00, 22),
    (13, 'CUA-ROB-CAB-EDL-I-013', 59.00, 11),
    (14, 'CUA-PRI-HOR-SBM-I-014', 66.00, 16),
    (15, 'CUA-SPI-HER-SBM-I-015', 73.00, 21),
    (16, 'CUA-BAR-UNI-SBM-I-016', 80.00, 10),
    (17, 'CUA-PRI-VER-SBM-I-017', 87.00, 15),
    (18, 'CUA-MI-PRO-BGL-S-018', 53.00, 20),
    (19, 'CUA-MI-PRO-SBM-S-019', 60.00, 25),
    (20, 'CUA-MAR-ACA-ACA-S-020', 67.00, 14),
    (21, 'CUA-MAR-WHT-EDL-S-021', 74.00, 19),
    (22, 'CUA-MAR-BLK-EDL-S-022', 81.00, 24),
    (23, 'CUA-REF-BLU-ERF-S-023', 88.00, 13),
    (24, 'CUA-REF-WHT-ERF-S-024', 54.00, 18),
    (25, 'CUA-BIO-MAR-WHT-SBM-S-025', 61.00, 23),
    (26, 'CUA-BIO-MAR-BLK-SBM-S-026', 68.00, 12),
    (27, 'CUA-ACA-SBM-S-027', 75.00, 17),
    (28, 'CUA-MI-GRA-SBM-S-028', 82.00, 22),
    (29, 'CUA-WHT-BMA-S-029', 89.00, 11),
    (30, 'CUA-BLK-BMA-S-030', 55.00, 16),
    (31, 'CUA-PIE-SIN-ROS-ELE-I-031', 62.00, 21),
    (32, 'CUA-PIE-SIN-AZU-ELE-I-032', 69.00, 10),
    (33, 'CUA-MI-PRI-KPO-BRI-I-033', 76.00, 15),
    (34, 'CUA-MI-PRI-KPO-SB3-I-034', 83.00, 20),
    (35, 'CUA-MI-PRI-KPO-B33-I-035', 90.00, 25),
    (36, 'CUA-MI-PRI-ROB-BRI-I-036', 56.00, 14),
    (37, 'CUA-MI-PRI-ROB-SB3-I-037', 63.00, 19),
    (38, 'CUA-MI-PRI-ROB-B33-I-038', 70.00, 24),
    (39, 'CUA-BEL-PRI-BRI-I-039', 77.00, 13),
    (40, 'CUA-HER-GAL-BRI-I-040', 84.00, 18),
    (41, 'CUA-HER-GAL-SB3-I-041', 50.00, 23),
    (42, 'CUA-LIL-PRI-BRI-I-042', 57.00, 12),
    (43, 'CUA-AZU-PRI-BRI-I-043', 64.00, 17),
    (44, 'CUA-ROS-PER-BRI-I-044', 71.00, 22),
    (45, 'CUA-AZU-ACE-BRI-I-045', 78.00, 11),
    (46, 'CUA-MI-DUL-PRI-SB3-I-046', 85.00, 16),
    (47, 'CUA-PIE-SIN-BLA-ELE-S-047', 51.00, 21),
    (48, 'CUA-PIE-SIN-NEG-ELE-S-048', 58.00, 10),
    (49, 'CUA-SIN-BLA-BRI-S-049', 65.00, 15),
    (50, 'CUA-SIN-BLA-SB3-S-050', 72.00, 20),
    (51, 'CUA-SIN-NEG-BRI-S-051', 79.00, 25),
    (52, 'CUA-SIN-NEG-SB3-S-052', 86.00, 14),
    (53, 'CUA-SIN-NEG-B33-S-053', 52.00, 19),
    (54, 'CUA-MAD-GLD-BRI-S-054', 59.00, 24),
    (55, 'CUA-TEX-CUE-BEI-BRI-S-055', 66.00, 13),
    (56, 'CUA-TEX-CUE-AZU-BRI-S-056', 73.00, 18),
    (57, 'CUA-DOR-BRI-S-057', 80.00, 23),
    (58, 'ANU-CUA-DIA-PNK-REF-I-058', 87.00, 12),
    (59, 'ANU-CUA-DIA-BLU-REF-I-059', 53.00, 17),
    (60, 'ANU-CUA-BOO-PNK-SEC-I-060', 60.00, 22),
    (61, 'ANU-CUA-BOO-BLU-SEC-I-061', 67.00, 11),
    (62, 'ANU-BOO-DIA-PNK-PRE-I-062', 74.00, 16),
    (63, 'ANU-BOO-DIA-BLU-PRE-I-063', 81.00, 21),
    (64, 'ANU-BOO-WHT-PNK-HOL-I-064', 88.00, 10),
    (65, 'ANU-BOO-WHT-BLU-HOL-I-065', 54.00, 15),
    (66, 'ANU-BOO-PRE-PNK-HOL-I-066', 61.00, 20),
    (67, 'ANU-BOO-PRE-BLU-HOL-I-067', 68.00, 25),
    (68, 'ANU-CUA-DIA-BLK-REF-S-068', 75.00, 14),
    (69, 'ANU-CUA-BOO-BRN-SEC-S-069', 82.00, 19),
    (70, 'ANU-BOO-DIA-BLK-PRE-S-070', 89.00, 24),
    (71, 'ANU-BOO-BLK-HOL-S-071', 55.00, 13),
    (72, 'ANU-BOO-WHT-HOL-S-072', 62.00, 18),
    (73, 'ANU-BOO-PRE-HOL-S-073', 69.00, 23);


SELECT COUNT(*) AS productos_registrados FROM inventario_productos;
