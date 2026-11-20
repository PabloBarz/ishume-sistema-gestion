# API de integraciÃ³n del catÃ¡logo ISHUME

ISHUME publica el catÃ¡logo completo de modelos activos para que el sistema PHP aplique sus filtros localmente. La API es de solo lectura y no modifica tablas ni relaciones.

## ConfiguraciÃ³n

1. Configura `PUBLIC_BASE_URL` con la IP LAN o dominio accesible de ISHUME para que `imagen_url` sea absoluta. Si PHP o los usuarios estÃ¡n en otro equipo, no uses `localhost`.
2. Configura `PHP_SYSTEM_ORIGIN` con el origen exacto del sistema PHP, incluyendo esquema y puerto si lo usa (por ejemplo, `http://192.168.1.20`). No agregues una ruta. Esta configuraciÃ³n autoriza un Ãºnico origen CORS; no se admite `*`. Si el origen queda vacÃ­o, CORS no habilita ningÃºn origen.
3. Reinicia ISHUME despuÃ©s del cambio.

## Endpoint

```http
GET /api/integracion/catalogo
```

No requiere API Key ni sesiÃ³n ISHUME. No acepta filtros ni paginaciÃ³n; parÃ¡metros de consulta adicionales se ignoran. Devuelve todos los modelos activos cuya disponibilidad permite ofrecerlos (modelo, diseÃ±o, categorÃ­a y proveedor activos), con los datos relacionados:

| Campo | DescripciÃ³n |
| --- | --- |
| `id_modelo`, `nombre_modelo` | Identificador y nombre del modelo |
| `presentacion`, `precio`, `nivel_educativo` | Datos del modelo |
| `descripcion` | Alias temporal de `presentacion` para consumidores PHP antiguos |
| `imagen_url` | URL absoluta configurada con `PUBLIC_BASE_URL`; `null` si no hay imagen |
| `id_diseno`, `nombre_diseno` | DiseÃ±o relacionado |
| `id_categoria`, `nombre_categoria` | CategorÃ­a relacionada |
| `id_proveedor`, `nombre_proveedor` | Proveedor relacionado |

Respuesta:

```json
{
  "success": true,
  "data": [{
    "id_modelo": 167,
    "nombre_modelo": "MARAVILLAS ACADÃ‰MICO",
    "presentacion": "Vertical",
    "descripcion": "Vertical",
    "precio": 67,
    "nivel_educativo": "Primaria - Superior",
    "estado": "Activo",
    "imagen_url": "http://192.168.1.20:3000/uploads/modelos/imagen.png",
    "id_diseno": 5,
    "nombre_diseno": "PIEZAS 3D Y FONDO BRILLANTES",
    "id_categoria": 1,
    "nombre_categoria": "CUADROS",
    "id_proveedor": 2,
    "nombre_proveedor": "JOSELITO"
  }]
}
```

Los unicos niveles oficiales son `PRONOEI - Inicial` y `Primaria - Superior`. El dato persistido en `modelos.presentacion` sustituye a `modelos.descripcion`; el campo `descripcion` de la respuesta se conserva temporalmente como alias para consumidores PHP antiguos. Clientes nuevos deben leer y enviar `presentacion`. Los datos proceden de los servicios/relaciones actuales de ISHUME. La consulta incluye solo modelos ofrecibles y reutiliza el formateador de URLs de imÃ¡genes existente.

## Postman y CORS

Importa `docs/postman/ISHUME-API-Integracion.postman_collection.json`, ajusta `base_url` si es necesario y ejecuta **Consultar catÃ¡logo completo**. No configures Authorization. Postman no aplica la restricciÃ³n del navegador CORS; para comprobarla desde el navegador, la respuesta incluirÃ¡ `Access-Control-Allow-Origin` solo cuando el encabezado `Origin` coincida exactamente con `PHP_SYSTEM_ORIGIN`.

Las rutas internas de ISHUME conservan sus middlewares de autenticaciÃ³n y autorizaciÃ³n actuales.
