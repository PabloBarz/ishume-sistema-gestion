# Catalogo de modelos para compras bajo pedido

La estructura es Categoria -> Diseno -> Modelo. Cada modelo contiene nombre, descripcion opcional (hasta 255 caracteres), nivel educativo, diseno, estado y precio referencial en soles. El precio admite de 0 a 99999999.99 y hasta dos decimales; es obligatorio al crear o editar. El valor inicial SQL 0.00 permite cargar modelos pendientes de valorizacion.

Se retiro InventarioProducto: no hay CRUD de productos locales, SKU, stock, disponibilidad, alertas de existencias ni Kardex. El precio se muestra y edita desde Modelos. La ruta existente #/inventario se conserva para los enlaces guardados, con el nombre visible Catalogo.

Los estados de categorias, disenos y modelos siguen controlando la disponibilidad del catalogo. Un modelo puede desactivarse sin consultar productos o existencias. Su activacion requiere diseno y categoria activos.

Compras referencia directamente modelos.id_modelo. El sistema externo consume el catalogo local y devuelve esos mismos IDs. Se verifican los IDs al consultar el contrato; los nombres, clasificacion y proveedores se obtienen de nuestra base. El precio referencial de modelos no reemplaza el precio cotizado por proveedor en orden_detalles.precio_unitario.

Cada diseño pertenece a un único proveedor mediante `disenios.id_proveedor`; un proveedor puede abastecer varios diseños. Los modelos heredan el proveedor de su diseño. Solo se asignan proveedores activos al crear o cambiar la relación; una relación histórica a un proveedor desactivado puede conservarse al editar otros datos, pero no permite comprar mientras permanezca inactivo.

Recepciones, clasificacion por colegio, preparacion y despachos siguen siendo cantidades vinculadas a pedidos. No generan saldos de almacen ni movimientos de inventario.

## Desarrollo

El unico esquema es database/ishume_bd_unificada.sql. Los cambios se hacen directamente en CREATE TABLE; no se generan migraciones ni ALTER para actualizar bases existentes.

Para reiniciar, recrear la base y ejecutar el esquema completo. Despues ejecutar src/database/ishume_inserts_catalogo.sql, que conserva categorias, disenos y 73 modelos con precios demostrativos. Ambos archivos usan bd_ishume; configurar DB_NAME con ese nombre.

El reinicio elimina los registros anteriores. Las compras, ordenes y pagos se crean desde la aplicacion. No se ejecuta ningun reinicio automaticamente desde el proyecto.

## Imagenes de modelos

Las imagenes principales se administran desde el CRUD de Modelos y se almacenan como archivos en `storage/uploads/modelos/`, fuera de `public/`; la base solo conserva `modelos.imagen_path` (ruta relativa `/uploads/modelos/<archivo>`). El endpoint HTTP publico es `/uploads/modelos/` y el catalogo devuelve `imagen_path` e `imagen_url`; si el modelo no tiene foto, ambos valores son `null`. El usuario puede agregar o reemplazar la imagen desde la edicion del mismo modelo, sin crear otro registro. Desactivar un modelo no elimina su imagen.

Configura `PUBLIC_BASE_URL` con el origen HTTP de esta instancia de Express, por ejemplo `http://localhost:3000` en el mismo equipo. Para que otras computadoras de la red accedan, reemplaza `localhost` por la IP LAN del servidor ISHUME (por ejemplo `http://192.168.1.20:3000`) o por el dominio publicado; no se modifican las rutas relativas guardadas en MySQL. El puerto debe coincidir con `PORT`, y la red/firewall debe permitir HTTP al servidor Express.

El directorio `storage/uploads/modelos/` debe persistir entre reinicios y actualizaciones/deploys; excluye el contenido de uploads de Git y respalda este almacenamiento junto con la base de datos. No lo borres durante una actualización de la aplicación.
