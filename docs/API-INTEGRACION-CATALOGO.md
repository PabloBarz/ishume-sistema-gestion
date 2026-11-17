# API de integración del catálogo ISHUME

API de consulta de solo lectura para consumidores externos autorizados. El catálogo y sus identificadores continúan perteneciendo a ISHUME; esta fase no recibe contratos ni modifica el sistema PHP.

## Configuración

1. Copia `.env.example` a `.env` si todavía no tienes este archivo.
2. Genera una clave privada (por ejemplo, `openssl rand -hex 32`) y configura `INTEGRATION_API_KEY=<clave-generada>` en `.env`. No publiques ni compartas esa clave. El valor de `.env.example` es solo un marcador y debe reemplazarse.
3. Asegura que `PUBLIC_BASE_URL` contenga el origen HTTP accesible del servidor ISHUME. En desarrollo local se usa `http://localhost:3000`; para que un equipo PHP u otro computador acceda, configura la IP LAN o el dominio de ISHUME.
4. Reinicia ISHUME después de cambiar la configuración.

Las solicitudes autorizadas envían `Authorization: Bearer <INTEGRATION_API_KEY>`. Una clave ausente o incorrecta devuelve HTTP 401. El middleware solo protege las rutas de integración y no modifica las rutas internas.

## Endpoints

### Listar modelos disponibles

`GET /api/integracion/v1/catalogo/modelos`

Parámetros opcionales combinables:

| Parámetro | Uso |
| --- | --- |
| `buscar` | Busca por nombre o fragmento del identificador del modelo. Máximo 100 caracteres. |
| `id_categoria` | ID positivo de categoría. |
| `id_proveedor` | ID positivo de proveedor. |
| `nivel_educativo` | `INICIAL` o `SUPERIOR` (no distingue mayúsculas). |
| `pagina` | Página desde 1; valor predeterminado 1. |
| `limite` | Registros por página entre 1 y 100; valor predeterminado 50. |

Ejemplos:

```text
GET /api/integracion/v1/catalogo/modelos?buscar=MARAVILLAS
GET /api/integracion/v1/catalogo/modelos?id_categoria=1&id_proveedor=2
GET /api/integracion/v1/catalogo/modelos?nivel_educativo=SUPERIOR&pagina=1&limite=25
```

Respuesta de lista:

```json
{
  "success": true,
  "data": [],
  "pagination": { "pagina": 1, "limite": 50, "total": 0, "total_paginas": 0 }
}
```

Cada elemento de `data` incluye `id_modelo`, `nombre_modelo`, `descripcion`, `precio`, `nivel_educativo`, `estado`, `imagen_url`, `id_diseno`, `nombre_diseno`, `id_categoria`, `nombre_categoria`, `id_proveedor` y `nombre_proveedor`. `imagen_url` se construye desde `imagen_path` y `PUBLIC_BASE_URL`; no se deriva del encabezado Host. Sin imagen, vale `null`. `estado` se representa como `Activo` o `Inactivo`; el listado solo ofrece modelos cuya disponibilidad actual está activa (modelo, diseño, categoría y proveedor).

### Consultar un modelo disponible

`GET /api/integracion/v1/catalogo/modelos/:id`

Devuelve `{ "success": true, "data": { ...modelo } }`. Un ID inexistente, inactivo o que no pueda ofrecerse devuelve HTTP 404.

### Respuestas de error

- HTTP 400: parámetro o ID mal formado.
- HTTP 401: API Key ausente, inválida o sin configurar.
- HTTP 404: modelo no encontrado/no disponible.
- HTTP 500: error interno; el cuerpo no revela detalles técnicos.

## Probar con Postman

1. Importa `docs/postman/ISHUME-API-Integracion.postman_collection.json` en Postman.
2. Abre las variables de la colección. `base_url` inicia en `http://localhost:3000`; ajústalo si ISHUME usa otro puerto u host. Pega la clave configurada en el campo local `api_key` (no la exportes ni la guardes en el repositorio).
3. Ejecuta las solicitudes bajo **Catálogo**. Los valores de IDs son parámetros de ejemplo y deben corresponder a registros de la base de datos que estás probando.
4. Las solicitudes **Sin API Key** y **API Key incorrecta** deben responder HTTP 401.
5. Para verificar filtros combinados, usa IDs reales de categoría y proveedor; todos los filtros se aplican simultáneamente.

La colección incluye ejemplos representativos de respuestas HTTP 200 y 401. Los datos reales devueltos por las solicitudes proceden de la base de datos activa de ISHUME.
