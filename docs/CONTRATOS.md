# Consulta de contratos

1. Configura en tu archivo `.env` la URL real del endpoint del sistema original:

   ```dotenv
   CONTRATOS_API_URL=http://localhost/sistema-original/api/contratos.php
   ```

   La dirección anterior es un ejemplo. Usa el nombre real del archivo (`contrato.php` o `contratos.php`) y la ruta de tu instalación. El servicio agrega el parámetro `id` en cada consulta.

2. Inicia el proyecto con `npm start` (Node.js 18 o posterior).
3. Abre `http://localhost:3000/#/contratos` o selecciona **Consultar contratos** en el menú.
4. Ingresa un ID existente. Puedes realizar otra búsqueda sin recargar la página.

El campo `cliente` se muestra completo, incluyendo el colegio, comas y guiones que tenga el nombre original. Los modelos y cantidades provienen de `productos`. Una fecha nula y un contrato sin modelos tienen mensajes propios.

Flujo: `public/views/contratos.html` → `public/js/modules/contratos.js` → `GET /api/contratos?id=...` → `src/routes/contratoRouter.js` → `src/controllers/contratoController.js` → `src/services/contratoService.js` → API externa.

La consulta no escribe en MySQL. La URL externa se configura en el servidor, no en el navegador. Tras cambiar `.env`, reinicia Node.js. El endpoint debe ser accesible desde la máquina donde corre Node.js.

Verificación automatizada con un servidor externo simulado: `node --test tests/contratos.test.js`.
