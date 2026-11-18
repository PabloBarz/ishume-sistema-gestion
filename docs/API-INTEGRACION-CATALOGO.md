# API de integración del catálogo ISHUME

ISHUME publica el catálogo completo de modelos activos para que el sistema PHP aplique sus filtros localmente. La API es de solo lectura y no modifica tablas ni relaciones.

## Configuración

1. Configura `PUBLIC_BASE_URL` con el origen accesible de ISHUME para que `imagen_url` sea absoluta.
2. Configura `PHP_SYSTEM_ORIGIN` con el origen exacto del sistema PHP, incluyendo esquema y puerto si lo usa (por ejemplo, `http://localhost:8000`). No agregues una ruta. Esta configuración autoriza un único origen CORS; no se admite `*`. Si el origen queda vacío, CORS no habilita ningún origen.
3. Reinicia ISHUME después del cambio.

## Endpoint

```http
GET /api/integracion/catalogo
```

No requiere API Key ni sesión ISHUME. No acepta filtros ni paginación; parámetros de consulta adicionales se ignoran. Devuelve todos los modelos activos cuya disponibilidad permite ofrecerlos (modelo, diseño, categoría y proveedor activos), con los datos relacionados:

| Campo | Descripción |
| --- | --- |
| `id_modelo`, `nombre_modelo` | Identificador y nombre del modelo |
| `descripcion`, `precio`, `nivel_educativo` | Datos del modelo |
| `imagen_url` | URL absoluta configurada con `PUBLIC_BASE_URL`; `null` si no hay imagen |
| `id_diseno`, `nombre_diseno` | Diseño relacionado |
| `id_categoria`, `nombre_categoria` | Categoría relacionada |
| `id_proveedor`, `nombre_proveedor` | Proveedor relacionado |

Respuesta:

```json
{
  "success": true,
  "data": [{
    "id_modelo": 167,
    "nombre_modelo": "MARAVILLAS ACADÉMICO",
    "descripcion": null,
    "precio": 67,
    "nivel_educativo": "SUPERIOR",
    "estado": "Activo",
    "imagen_url": "http://localhost:3000/uploads/modelos/imagen.png",
    "id_diseno": 5,
    "nombre_diseno": "PIEZAS 3D Y FONDO BRILLANTES",
    "id_categoria": 1,
    "nombre_categoria": "CUADROS",
    "id_proveedor": 2,
    "nombre_proveedor": "JOSELITO"
  }]
}
```

Los datos proceden de los servicios/relaciones actuales de ISHUME. La consulta incluye solo modelos ofrecibles y reutiliza el formateador de URLs de imágenes existente.

## Postman y CORS

Importa `docs/postman/ISHUME-API-Integracion.postman_collection.json`, ajusta `base_url` si es necesario y ejecuta **Consultar catálogo completo**. No configures Authorization. Postman no aplica la restricción del navegador CORS; para comprobarla desde el navegador, la respuesta incluirá `Access-Control-Allow-Origin` solo cuando el encabezado `Origin` coincida exactamente con `PHP_SYSTEM_ORIGIN`.

Las rutas internas de ISHUME conservan sus middlewares de autenticación y autorización actuales.
