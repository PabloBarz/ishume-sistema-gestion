-- Proveedores minimos para desarrollo; ejecutar despues del esquema unificado.
-- Solo se cargan razon social y estado; los demas datos quedan vacios o por defecto.
USE bd_ishume;

INSERT INTO proveedores (razon_social, estado) VALUES
  ('LALO', 'Activo'),
  ('Joselito', 'Activo'),
  ('LiderBook', 'Activo');
