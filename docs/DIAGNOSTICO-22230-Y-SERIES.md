# Diagnóstico de contratos y numeración

## Contrato 22230

Verificado contra la API configurada, el código PHP en `C:\xampp\htdocs\empresa`
y la base externa `administracion`, utilizando consultas de solo lectura.

- `22230` es parte del nombre del colegio, no el ID del contrato.
- ID de contrato: **94**. Colegio: **22230 Inicial**, ID de colegio **20**.
- Cliente: **Ochoa Saravia Blanca Elena**. Fecha de contrato: **03/08/2026**.
- Servicio: **Promoción**, ID 1. `estado_trabajo`: **en_proceso**.
- Tanto `api/contrato.php?listado=escolares_en_proceso` como `api/contrato.php?id=94`
  devuelven `productos: []`, sin fecha de entrega ni unidades definidas.
- En `detalle_contrato` y `snapshot_contrato` existe el registro. En `contrato_modelo`
  tiene **0 vínculos**; no se están perdiendo modelos en JavaScript ni por el JOIN con `modelo`.
- Existe otro colegio parecido, ID 81: **I.E colegio 22230 Nivel inicial**. Su contrato
  **29**, del 05/05/2026, tiene 7 modelos y está **entregado**, por lo que no corresponde
  ofrecerlo en el listado de contratos en proceso. No se deben mezclar estos contratos.
- El contrato **98**, **COLEGIO PAULINO REATEGUI PRIMARIA**, también está en proceso
  sin vínculos de modelos. No se borró ni completó ningún dato de estos contratos.

El listado PHP filtra por servicio escolar y trabajo en proceso, pero no exige modelos.
La consulta individual filtra solamente por ID. El registro 94 cumple los filtros del
listado, aunque está incompleto para compras. Ambas respuestas coinciden.

El buscador de ISHUME recibe el listado desde esa API, no desde contratos locales.
Se conserva el contrato incompleto como resultado deshabilitado con el mensaje
**Sin modelos disponibles**. Se comprueban IDs de modelos, nombres, cantidades positivas
y ausencia de modelos duplicados. Si algún modelo tiene datos inválidos, se muestra el
aviso correspondiente y no se elimina silenciosamente parte de los productos.

### Por qué no se encuentra en el buscador PHP

`funciones/lista.php` selecciona `co.nombre AS colegio_nombre`, pero su condición de
búsqueda solo usa `sn.cliente_nombre`, DNI y provincia. `funciones/edicion.php` también
busca únicamente cliente, DNI y provincia. El nombre de colegio no participa.

La corrección de esa búsqueda externa sería agregar **`OR co.nombre LIKE ?`** a ambas
condiciones y enviar un cuarto parámetro `$like`. No se aplicó ningún cambio al PHP.
Tampoco es necesario cambiar su API para identificar el problema: devuelve honestamente
los datos existentes. Los modelos del contrato 94 deben completarse en el sistema de origen
si realmente corresponde comprarlos; ISHUME no debe inventarlos ni tomarlos del contrato 29.

## Numeración actual y propuesta

Los pedidos usan `ordenes_compra.id_orden` como punto de partida, con prefijo de proveedor
y mínimo cuatro dígitos. El ID es global entre proveedores; no es un contador por proveedor.
Las órdenes masivas usan `solicitudes_cotizacion.id_solicitud` con prefijo `OC-MAS` y mínimo
seis dígitos. Ambas implementaciones avanzan si encuentran un código ocupado.

Los índices únicos, bloqueos y tokens protegen contra duplicados. Las relaciones usan IDs
numéricos, no el texto del código; los vínculos de `solicitud_ordenes` no deben cambiarse.

Los números también avanzaron por pruebas anteriores: InnoDB consume AUTO_INCREMENT en
inserciones revertidas y en ciertos fallos. Esto incluye pruebas transaccionales que no
dejaron compras guardadas. Los saltos no significan que falten pedidos que deban restaurarse.

En la lectura inicial de este diagnóstico, los máximos de códigos guardados eran:

| Serie | Máximo guardado | Siguiente número seguro propuesto |
|---|---:|---|
| OC-JOS | 136 | OC-JOS-0137 |
| OC-LAL | 135 | OC-LAL-0136 |
| OC-LIB | 132 | OC-LIB-0133 |
| OC-MAS | 73 | OC-MAS-0074 |

Los siguientes IDs AUTO_INCREMENT eran 137 y 74 en esa lectura; pueden avanzar por nuevas
operaciones o pruebas. El mecanismo **actual** sigue usando esos IDs, no la tabla propuesta.

No conviene rellenar huecos desde 0001: existen documentos y numeraciones históricas con
el mismo prefijo. La recomendación es continuar cada serie desde su máximo histórico,
reservando 0001 para proveedores realmente nuevos sin documentos previos. Si se necesita
una serie nueva desde 0001 para proveedores existentes, habría que acordar un prefijo
distinto, sin renombrar los códigos antiguos.

En esta lectura, 0001 no estaba ocupado, pero una serie que avanzara desde allí acabaría
alcanzando números ya utilizados (por ejemplo JOS 0009, LAL 0010, LIB 0013 y MAS 16).
No es suficiente cambiar el relleno a cuatro dígitos: `OC-MAS-0016` y `OC-MAS-000016`
son textos diferentes, pero representan el mismo número lógico. La propuesta toma el
máximo numérico histórico, ignorando el relleno, para evitar esa ambigüedad.

Se preparó `migrations/propuestas/002_series_documentos.sql`, **sin ejecutarlo**. Propone
una tabla de contadores con fila por proveedor y otra para órdenes masivas, prefijos únicos
y estables y bloqueo `FOR UPDATE` dentro de la transacción actual. No usa COUNT de pedidos,
no reinicia IDs ni modifica tablas o documentos existentes. Antes de aplicarla se requiere
respaldo, aprobación y revisión de prefijos históricos ambiguos. Después habría que adaptar
los dos generadores para consumir esas series sin perder sus protecciones de idempotencia.

## PDF y datos históricos

La nueva presentación usa `version_documento: 4` para no reinterpretar los documentos ya
guardados. Toma tipo, categoría y nivel de la instantánea del producto; no consulta el
catálogo actual para completar documentos históricos. Una característica ausente queda
vacía y su columna se omite si falta en todo el documento.

El RUC fue proporcionado por el usuario. El correo `compras@ishume.pe` y el celular
`+51 956 123 456` son **ficticios/provisionales**, identificados como tales junto a la
configuración `emisorPdf` de `src/services/ordenCompraPdfService.js`. Se deben reemplazar
cuando ISHUME confirme sus contactos reales. No se agregaron datos del proveedor.

Las versiones anteriores conservan sus datos y formato previo. No se ejecutó ninguna
migración, renumeración, borrado ni modificación de datos externos.
