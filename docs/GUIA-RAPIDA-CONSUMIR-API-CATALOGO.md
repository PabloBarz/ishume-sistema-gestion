# Guía rápida: consumir el catálogo API de ISHUME

## 1. Genera tu API Key

En una terminal, ejecuta uno de estos comandos:

```bash
openssl rand -hex 32
```

Si no tienes OpenSSL, con Node.js:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copia el resultado generado. No uses literalmente `replace-with-a-long-random-secret`: es solo un marcador de ejemplo y el API lo rechaza.

## 2. Configúrala en ISHUME

En la raíz del proyecto, crea `.env` copiando `.env.example` si aún no existe. En `.env`, agrega la línea o reemplaza el valor de ejemplo:

```env
INTEGRATION_API_KEY=PEGA_AQUI_LA_CLAVE_GENERADA
```

Guarda `.env` de forma privada; no lo subas a Git ni compartas la clave. Reinicia el servidor ISHUME.

## 3. Configura Postman

1. En Postman, selecciona **Import** y abre `docs/postman/ISHUME-API-Integracion.postman_collection.json`.
2. En las variables de la colección, deja `base_url` como `http://localhost:3000` si ese es el puerto de ISHUME y pega la clave generada en `api_key`.
3. Ejecuta **Consultar todos los modelos**. Las otras solicitudes permiten buscar por nombre/ID, filtrar por categoría, proveedor o nivel educativo, combinar filtros y consultar un modelo por ID.
4. **Sin API Key** y **API Key incorrecta** deben devolver `401 Unauthorized`.

El servidor requiere el encabezado:

```http
Authorization: Bearer TU_API_KEY
```

Ejemplos de rutas:

```text
GET http://localhost:3000/api/integracion/v1/catalogo/modelos
GET http://localhost:3000/api/integracion/v1/catalogo/modelos?buscar=MARAVILLAS
GET http://localhost:3000/api/integracion/v1/catalogo/modelos?id_categoria=1&id_proveedor=2
GET http://localhost:3000/api/integracion/v1/catalogo/modelos/167
```

## ¿La colección contiene datos de prueba?

`docs/postman/ISHUME-API-Integracion.postman_collection.json` es una colección importable de **solicitudes guardadas y ejemplos de respuesta**; no inserta ni contiene registros para cargar en MySQL. Las solicitudes consultan los datos reales de ISHUME. Sus IDs de ejemplo (como `167`, `1` y `2`) son parámetros: si no existen en tu base, reemplázalos por IDs reales.

## Consumir desde PHP u otro sistema (sin Postman)

El sistema externo hace una petición HTTP GET y envía la misma API Key en `Authorization`. Guarda la clave como variable de entorno del sistema consumidor (por ejemplo, `ISHUME_API_KEY`); no la escribas en el código.

### Ejemplo PHP con cURL

```php
<?php
$url = 'http://IP-O-DOMINIO-ISHUME:3000/api/integracion/v1/catalogo/modelos';
$apiKey = getenv('ISHUME_API_KEY');

$curl = curl_init($url);
curl_setopt_array($curl, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [
        'Accept: application/json',
        'Authorization: Bearer ' . $apiKey,
    ],
]);

$body = curl_exec($curl);
$status = curl_getinfo($curl, CURLINFO_HTTP_CODE);
if ($body === false || $status !== 200) {
    throw new RuntimeException('No se pudo consultar el catálogo ISHUME (HTTP ' . $status . ').');
}
curl_close($curl);

$respuesta = json_decode($body, true, 512, JSON_THROW_ON_ERROR);
$modelos = $respuesta['data']; // Usar en las tarjetas del sistema PHP.
```

### Ejemplo JavaScript en Node.js

```js
const baseUrl = process.env.ISHUME_API_URL || 'http://IP-O-DOMINIO-ISHUME:3000';
const respuesta = await fetch(`${baseUrl}/api/integracion/v1/catalogo/modelos`, {
  headers: { Authorization: `Bearer ${process.env.ISHUME_API_KEY}` },
});

if (!respuesta.ok) throw new Error(`ISHUME respondió HTTP ${respuesta.status}`);
const { data: modelos } = await respuesta.json();
```

Puedes agregar filtros a la URL, por ejemplo `?id_categoria=1&id_proveedor=2`. Si el sistema consumidor está en otra computadora, reemplaza `localhost` por la IP LAN o el dominio del servidor ISHUME y asegúrate de que el puerto esté accesible.

**JavaScript en navegador:** no llames la API directamente desde el frontend ni incluyas la API Key en el código del navegador; los usuarios podrían verla. Haz la consulta desde el backend PHP/Node de tu sistema y entrega al navegador solo los datos que necesita.
