-- Revierte solo las rutas asignadas por 20261118_variantes_joselito_imagenes_up.sql.
-- No elimina los archivos ni los registros de modelos.
UPDATE modelos
SET imagen_path = NULL
WHERE imagen_path IN (
  '/uploads/modelos/3d2594ed-eb47-421f-b94f-2e0cc84e05af.png',
  '/uploads/modelos/5434b496-50df-44ad-90fa-7532e5a6829c.png',
  '/uploads/modelos/a61f1ca0-3088-4d5d-9420-c08d99ddee64.png',
  '/uploads/modelos/5cfc2028-6f70-4d4f-b76f-2fa56b812b8c.png'
);
