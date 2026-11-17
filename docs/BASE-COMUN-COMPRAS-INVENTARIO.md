# Base de datos: Compras y catalogo

El script database/ishume_bd_unificada.sql instala 22 tablas: 10 de Compras, 3 de catálogo (categorias, disenios y modelos) y 9 previstas para etapas posteriores de recepción, clasificación, incidencias, preparación y despacho.

El catalogo local es la fuente unica de modelos. La API externa consume modelos.id_modelo y devuelve ese mismo identificador en sus contratos. Contratos y ordenes referencian directamente modelos: no existe la tabla productos ni una equivalencia id_modelo_api.

Un proveedor puede abastecer varios diseños, pero cada diseño tiene un solo `id_proveedor` en `disenios`. Todos los modelos del diseño usan esa relación. La compra valida que modelo, diseño, categoría y proveedor estén activos y que el proveedor seleccionado sea el asignado al diseño al revisar y al confirmar.

La descripcion pertenece a modelos, no a disenios. modelos.precio es referencial (DECIMAL(10,2), no negativo), distinto del precio cotizado por proveedor.

No existen tablas de existencias ni Kardex en la instalacion nueva. Las cantidades de recepcion y despacho pertenecen al seguimiento de pedidos. Las tablas futuras requieren sus validaciones de backend.

Para instalar, usar una base vacia y configurar DB_NAME con el nombre real del script (bd_ishume). Contratos sigue requiriendo la API externa. El catalogo inicial se carga con src/database/ishume_inserts_catalogo.sql.

En desarrollo se reinicia la base y se ejecutan el esquema completo y el catalogo. Los cambios se realizan en las definiciones de tablas; no se mantienen migraciones ni propuestas de actualizacion.
