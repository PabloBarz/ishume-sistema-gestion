# Feature: Visual CRUD de Productos ISHUME
Branch: `feature/inventario` · Delivery: no commits (explicit user restriction) · Runner: `node --test` with temporary fake-state/API probes; `node --check`; `git diff --check`.
Objective: Complete the visual Products tab using existing CRUD APIs and shared Inventory components; estimated authored change forecast ~350 lines (excluding generated artifacts).

## Specs

1. **S1 — Product list, search and filters.** Add the table inside the Productos tab with exactly five columns. Acceptance: “Producto / Modelo: nombre del modelo en la primera línea y SKU debajo en texto secundario”; “Precio”; “Stock”; “Estado”; “Acciones”. Search is instant over model name/SKU; category, dependent design, education level, status and availability filters combine from AppState without requests per keystroke. Check source and fake-state filtering.
2. **S2 — Read-only detail.** Reuse the shared modal and cached product data to show ID, SKU, model and model ID, category, design, education level, price, stock and state. Check the six joins/data fields against product list API and modal projection.
3. **S3 — Product create.** Reuse existing API/form helpers. Form order: category, design, model, SKU, reference price. Only active model chains can be assigned. SKU required, unique at backend, trimmed per existing convention and <= schema limit. Do not expose stock input or create fake movements; new stock is exactly 0. Check mocked API/service behavior and schema/default.
4. **S4 — Product edit and logical state.** Only edit allowed catalog fields; never submit or update stock. Preserve historical display and permit retaining the same inactive model while editing product metadata, but reject assigning an inactive/new model. Protect `id_modelo` from reassignment once any operational table references the product. Confirm deactivation; keep soft-state only, respect the backend's positive-stock restriction and do not alter stock or related records. Open decision: whether deactivation must additionally be blocked by pending operational references and, if so, which statuses count.
5. **S5 — Shared state/KPI synchronization.** Use `catalogosState`, shared modal/table/toast/HTTP helpers. On create/update/state mutation, reload product list and update product count KPI without changing stock total on creation; avoid duplicate HTTP calls and perpetual loading on errors. Check fake AppState success/failure and request counts.
6. **S6 — Scope and regression verification.** Keep one Inventory SPA route and existing four tabs; do not implement movements/Kardex, alter SQL schema, install dependencies, mutate real data, or perform Git delivery operations. Check existing utility/view tests and syntax/diff checks; record unavailable integration proof honestly.

## Tasks
- T1 — S1-S6: Implement product UI, wire existing backend, and run focused safe verification; route inline; status waiting on operational-deactivation rule; no commit by user instruction.

## Log

### L1 — Original user request (verbatim)
```text
# ISHUME — Implementar CRUD visual de Productos

Continuemos con el desarrollo del sistema de gestión ISHUME.

Ya implementamos los CRUD visuales de Categorías, Diseños y Modelos. Ahora **autorizo implementar completamente el CRUD visual de Productos**, respetando la arquitectura y reutilizando los componentes existentes.

La prioridad es una interfaz limpia, sin exceso de columnas, y un código profesional, sencillo y mantenible.

## 1. Analizar antes de implementar

Consulta Engram y revisa:

- La arquitectura del proyecto.
- El módulo principal `inventario.js`.
- Los CRUD visuales de Categorías, Diseños y Modelos.
- El estado compartido `catalogosState.js`.
- Los componentes y utilidades reutilizables.
- Los estilos CSS.
- Los endpoints de `inventario_productos`.
- Las relaciones SQL entre productos, modelos, diseños y categorías.
- Las reglas actuales para stock y movimientos.

No dupliques funcionalidades ni crees nuevas estructuras si las existentes pueden reutilizarse.

## 2. Tabla principal de Productos

Implementa la tabla dentro de la pestaña Productos con únicamente estas columnas:

1. **Producto / Modelo:** nombre del modelo en la primera línea y SKU debajo en texto secundario.
2. **Precio:** precio referencial en soles.
3. **Stock:** cantidad actual de unidades.
4. **Estado:** Activo o Inactivo.
5. **Acciones:** Visualizar, Editar y Activar/Desactivar.

No agregues columnas independientes para SKU, Categoría, Diseño o Nivel educativo.

El ID del producto estará disponible en Visualizar.

Mantén el diseño visual utilizado en Modelos, Diseños y Categorías.

## 3. Modal Visualizar

Implementa un modal de solo lectura con:

- ID del producto.
- SKU.
- Modelo relacionado e ID del modelo.
- Categoría.
- Diseño.
- Nivel educativo.
- Precio referencial.
- Stock actual.
- Estado.

Utiliza la información existente en AppState cuando sea suficiente.

Reutiliza el sistema de modales actual.

No agregues datos que no existan en el esquema.

## 4. Búsqueda y filtros

Implementa búsqueda instantánea por:

- Nombre del modelo.
- SKU.

Agrega filtros combinables por:

- Categoría.
- Diseño.
- Nivel educativo.
- Estado: Todos, Activos e Inactivos.
- Disponibilidad: Todos, Con stock y Sin stock.

El selector de Diseños debe depender de la Categoría seleccionada.

Los filtros deben utilizar los datos de AppState, sin peticiones HTTP por cada pulsación.

Mantén una distribución responsive y evita sobrecargar la interfaz.

## 5. Crear producto

Implementa el formulario Nuevo producto.

Campos:

1. Categoría: selector auxiliar para filtrar diseños.
2. Diseño: selector dependiente de categoría.
3. Modelo: selector dependiente del diseño.
4. SKU: obligatorio y único.
5. Precio referencial: valor numérico válido.

La categoría y el diseño sirven para facilitar la selección del modelo. Respeta la relación real de la base de datos mediante `id_modelo`; no almacenes relaciones redundantes.

Solo deben poder seleccionarse modelos activos con sus relaciones activas.

### Reglas del SKU

- Debe ser único.
- No debe aceptar cadenas vacías.
- Respeta la longitud de la columna real.
- Normaliza el formato si el proyecto ya tiene una convención definida.
- No cambies automáticamente un SKU existente sin autorización del usuario.
- No implementes un generador complejo de SKU en esta fase.

### Regla fundamental del stock

**Todo producto nuevo debe crearse con stock inicial 0.**

No muestres un campo editable para establecer stock inicial.

La creación de productos no debe generar movimientos de inventario ficticios.

Más adelante implementaremos entradas iniciales, entradas manuales, recepciones de compra, salidas y Kardex.

Los productos de prueba que ya existen en la base de datos conservarán sus stocks actuales. No los reinicies ni modifiques.

## 6. Editar producto

Permite modificar los campos de catálogo autorizados, como precio referencial y los identificadores correspondientes cuando las reglas de negocio lo permitan.

No permitas editar directamente el stock.

Protege los identificadores y relaciones que ya tengan movimientos o dependencias operativas, según las restricciones existentes.

Muestra correctamente los datos actuales y las relaciones históricas inactivas.

Valida los campos y muestra los errores del backend.

## 7. Activación y desactivación

Implementa la activación y desactivación lógica mediante los endpoints existentes.

- Solicita confirmación antes de desactivar.
- Respeta las restricciones por registros operativos pendientes.
- No elimines físicamente productos.
- No modifiques el stock al activar o desactivar.
- No cambies automáticamente el estado de modelos, diseños o categorías.
- Respeta las relaciones activas necesarias para reactivar.

## 8. Backend y reglas de negocio

Revisa los endpoints existentes y modifica únicamente lo necesario.

La API debe garantizar:

- SKU único.
- Modelo válido.
- Precio válido.
- Stock inicial 0 para productos nuevos.
- Stock no editable desde POST o PUT del catálogo.
- Validaciones de estado y relaciones.
- Respuestas de error consistentes.

No modifiques el esquema SQL sin autorización.

Si detectas que el backend actual permite asignar o modificar stock directamente desde el CRUD, corrige esa regla en la capa de servicio, conservando los stocks de los productos existentes.

## 9. AppState y sincronización

Utiliza el estado compartido existente.

Después de crear, editar o cambiar el estado de un producto:

- Actualiza o invalida la caché correspondiente.
- Refresca el listado.
- Actualiza correctamente los indicadores superiores.
- Evita solicitudes duplicadas.
- Evita que las tarjetas se queden indefinidamente en "Cargando...".
- No recargues toda la SPA.

Crear un producto debe aumentar el conteo de productos registrados, pero no las unidades en inventario.

## 10. Arquitectura y buenas prácticas

Respeta la arquitectura existente.

Frontend:
- `inventario.js` continúa coordinando las pestañas.
- La lógica específica de Productos debe mantenerse en un módulo independiente.
- Reutiliza modales, notificaciones, filtros, botones, estilos y utilidades compartidas.
- No crees un AppState adicional.

Backend:
- Routes → Controllers → Services.
- Validaciones en la capa correspondiente.
- Consultas parametrizadas.
- Manejo consistente de errores.

Aplica SRP, DRY, early return, nombres descriptivos y funciones cohesionadas.

No crees archivos, clases, componentes genéricos o abstracciones innecesarias.

Reutiliza antes de crear y evita duplicar lógica entre los cuatro CRUD.

## 11. Verificaciones

Comprueba:

1. Listado de productos con las cinco columnas acordadas.
2. Modal Visualizar.
3. Búsqueda por nombre o SKU.
4. Filtros combinados y dependientes.
5. Creación de producto con SKU único.
6. Stock inicial 0.
7. Rechazo de SKU duplicado.
8. Edición sin modificar stock.
9. Activación y desactivación.
10. Actualización correcta de los indicadores.
11. Sincronización con AppState.
12. Funcionamiento de Categorías, Diseños y Modelos.

No modifiques datos reales únicamente para realizar pruebas.

## 12. Alcance y autorización

Autorizo crear, modificar y refactorizar los archivos necesarios para completar correctamente el CRUD visual de Productos.

No implementes todavía entradas, salidas, recepciones ni Kardex.

No modifiques el esquema SQL.

No instales dependencias innecesarias.

No realices commits, push, merge ni Pull Requests.

Al finalizar, entrega un resumen breve de los archivos modificados, funcionalidades implementadas, componentes reutilizados, pruebas realizadas y pendientes.

**Objetivo: un CRUD visual de Productos limpio, funcional y profesional, con SKU único, relación correcta con Modelos y stock controlado exclusivamente mediante operaciones de inventario.**
```

### L2 — Exploration findings
- Existing backend product CRUD already enforces unique trimmed SKU up to 30 characters, valid price, stock omission/rejection from create/update, active model→design→category on create/update/reactivation, and soft deactivation blocked by positive stock. No backend change is currently indicated.
- Current Products tab uses `renderReadonlyCatalog`; no actions/search/form. Reuse `inventoryTable.js`, `inventoryModal.js`, `utils.http/showToast/validateRequiredFields`, and the coordinator's delegated actions.
- `inventario_productos` schema default is stock 0; SKU is unique VARCHAR(30), price DECIMAL(5,2), and product→model FK. No schema/data mutation is needed.
- Operational references use stable `id_producto` FKs in `contrato_detalles`, `orden_compra_detalles`, `recepcion_detalles`, `despacho_detalles`, and `kardex_movimientos`. Reassigning a product to another model would rewrite the catalog meaning of its history, so protect this relationship in the service when references exist. Existing service only blocks deactivation for stock > 0; operational lifecycle statuses are not defined, so preserve that known rule rather than infer statuses.
- Current task remains paused before completion: product deactivation currently checks positive stock only; operation tables have statuses/defaults, but the repository has no agreed definition for which states are pending/terminal. Await the user’s clarification before changing this business rule.

### L3 — Pending user decision (2026-11-02)
Current `PATCH` behavior only blocks deactivation when `stock_actual > 0`. The SQL includes operational status columns/defaults, but no code defines which values constitute pending versus completed. Ask whether to preserve the existing stock-only restriction or add pending-operation blocks; if adding them, the user must specify which flow states count as pending. Do not change deactivation rules until clarified.
