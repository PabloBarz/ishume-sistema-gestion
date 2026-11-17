# Catalogo de modelos para compras bajo pedido

La estructura es Categoria -> Diseno -> Modelo. Cada modelo contiene nombre, descripcion opcional (hasta 255 caracteres), nivel educativo, diseno, estado y precio referencial en soles. El precio admite de 0 a 99999999.99 y hasta dos decimales; es obligatorio al crear o editar. El valor inicial SQL 0.00 permite cargar modelos pendientes de valorizacion.

Se retiro InventarioProducto: no hay CRUD de productos locales, SKU, stock, disponibilidad, alertas de existencias ni Kardex. El precio se muestra y edita desde Modelos. La ruta existente #/inventario se conserva para los enlaces guardados, con el nombre visible Catalogo.

Los estados de categorias, disenos y modelos siguen controlando la disponibilidad del catalogo. Un modelo puede desactivarse sin consultar productos o existencias. Su activacion requiere diseno y categoria activos.

Compras referencia directamente modelos.id_modelo. El sistema externo consume el catalogo local y devuelve esos mismos IDs. Se verifican los IDs al consultar el contrato; los nombres, clasificacion y proveedores se obtienen de nuestra base. El precio referencial de modelos no reemplaza el precio cotizado por proveedor en orden_detalles.precio_unitario.

Los proveedores se asocian a disenios desde el formulario de Disenos mediante seleccion multiple. La tabla disenio_proveedores evita duplicados y permite varios proveedores por diseno. Los modelos heredan esa lista. Antes de comprar, asociar al menos un proveedor activo al diseno; los inserts no inventan esas relaciones. Si hay varios proveedores disponibles, se elige uno por linea de compra.

Recepciones, clasificacion por colegio, preparacion y despachos siguen siendo cantidades vinculadas a pedidos. No generan saldos de almacen ni movimientos de inventario.

## Desarrollo

El unico esquema es database/ishume_bd_unificada.sql. Los cambios se hacen directamente en CREATE TABLE; no se generan migraciones ni ALTER para actualizar bases existentes.

Para reiniciar, recrear la base y ejecutar el esquema completo. Despues ejecutar src/database/ishume_inserts_catalogo.sql, que conserva categorias, disenos y 73 modelos con precios demostrativos. Ambos archivos usan bd_ishume; configurar DB_NAME con ese nombre.

El reinicio elimina los registros anteriores. Las compras, ordenes y pagos se crean desde la aplicacion. No se ejecuta ningun reinicio automaticamente desde el proyecto.
