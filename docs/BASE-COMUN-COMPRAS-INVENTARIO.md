# Base de datos para la integracion actual

El unico script de instalacion en database es database/ishume_bd_unificada.sql. Contiene 25 tablas: 11 de Compras, 4 del catalogo independiente de Inventario y 10 previstas para recepcion, clasificacion, incidencias, preparacion, despacho y Kardex.

Compras mantiene productos y sus relaciones actuales. Inventario mantiene inventario_productos y modelos. Los IDs de ambos catalogos son independientes; no se equiparan ni se sincronizan automaticamente. La propuesta de usar modelos como catalogo compartido todavia no esta implementada.

El servicio inventarioProductoService.js consulta las claves foraneas reales para comprobar dependencias, sin buscar tablas de otro esquema ni confundir productos de Compras con productos del catalogo local.

El Kardex operativo propuesto referencia productos de Compras. Las tablas de etapas posteriores no implican que esas funcionalidades esten implementadas; requieren validaciones y transacciones al desarrollarlas.

## Instalacion manual

1. Revisar el script. Ejecutar solamente en una base nueva y vacia, no sobre datos existentes.
2. El nombre predeterminado es ishume_unificada. Para una base separada, cambiar CREATE DATABASE y USE.
3. Configurar DB_NAME con el nombre elegido y reiniciar Node. Contratos sigue requiriendo su API externa.
4. Verificar Compras y los catalogos con datos controlados.

El script no se ha ejecutado desde el proyecto ni esta validado mediante una instalacion real. No migra datos existentes. Las pruebas locales usan revision estatica del SQL y consultas simuladas. Las versiones alternativas de database se retiraron para evitar confundir instalaciones.
