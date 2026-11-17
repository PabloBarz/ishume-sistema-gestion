# Base de datos: Compras y catalogo

El script database/ishume_bd_unificada.sql instala 23 tablas: 10 de Compras, 4 de catalogo (categorias, disenios, modelos, disenio_proveedores) y 9 previstas para etapas posteriores de recepcion, clasificacion, incidencias, preparacion y despacho.

El catalogo local es la fuente unica de modelos. La API externa consume modelos.id_modelo y devuelve ese mismo identificador en sus contratos. Contratos y ordenes referencian directamente modelos: no existe la tabla productos ni una equivalencia id_modelo_api.

Los proveedores se asocian a disenios mediante disenio_proveedores (varios proveedores por diseno). Todos los modelos del diseno usan esa relacion. La compra valida que modelo, diseno, categoria y proveedor esten activos y que exista la asociacion al revisar y al confirmar.

La descripcion pertenece a modelos, no a disenios. modelos.precio es referencial (DECIMAL(10,2), no negativo), distinto del precio cotizado por proveedor.

No existen tablas de existencias ni Kardex en la instalacion nueva. Las cantidades de recepcion y despacho pertenecen al seguimiento de pedidos. Las tablas futuras requieren sus validaciones de backend.

Para instalar, usar una base vacia y configurar DB_NAME con el nombre real del script (bd_ishume). Contratos sigue requiriendo la API externa. El catalogo inicial se carga con src/database/ishume_inserts_catalogo.sql.

En desarrollo se reinicia la base y se ejecutan el esquema completo y el catalogo. Los cambios se realizan en las definiciones de tablas; no se mantienen migraciones ni propuestas de actualizacion.
