import { appState } from '../../appState.js';
import { formatCurrencyPEN, formatNumber, http, showToast, validateRequiredFields } from '../../utils.js';
import { createActionButton, createCell, createNumericCell, createStatusCell, createTable } from '../../components/inventoryTable.js';

let productSearch = '';
let productCategoryFilter = '';
let productDesignFilter = '';
let productLevelFilter = '';
let productStateFilter = '';
let productAvailabilityFilter = '';

export function filterProducts(products, {
  search = '', categoryId = '', designId = '', level = '', state = '', availability = '',
} = {}) {
  const query = search.trim().toLocaleLowerCase('es-PE');
  return products.filter((product) => {
    const matchesSearch = [product.nombre_modelo, product.sku]
      .some((value) => String(value ?? '').toLocaleLowerCase('es-PE').includes(query));
    const matchesCategory = categoryId === '' || String(product.id_categoria) === categoryId;
    const matchesDesign = designId === '' || String(product.id_diseno) === designId;
    const matchesLevel = level === '' || String(product.nivel_educativo ?? '') === level;
    const matchesState = state === '' || String(product.estado) === state;
    const stock = Number(product.stock_actual);
    const matchesAvailability = availability === '' || (availability === 'stock' ? stock > 0 : stock === 0);
    return matchesSearch && matchesCategory && matchesDesign && matchesLevel && matchesState && matchesAvailability;
  });
}

function renderProductTable(products) {
  const rows = products.map((product) => {
    const active = Number(product.estado) === 1;
    const inactiveRelation = Number(product.estado_modelo) !== 1 || Number(product.estado_diseno) !== 1 || Number(product.estado_categoria) !== 1;
    const actions = document.createElement('td');
    actions.className = 'inventory-product-actions';
    const toggle = createActionButton({
      action: 'toggle', id: product.id_producto, dataset: 'product',
      label: active ? 'Desactivar producto' : inactiveRelation ? 'No se puede activar: el modelo, diseño o categoría está inactivo' : 'Activar producto',
      icon: active ? 'bi bi-toggle-on' : 'bi bi-toggle-off',
      className: active ? 'inventory-state-off' : 'inventory-state-on',
    });
    toggle.disabled = !active && inactiveRelation;
    actions.append(
      createActionButton({ action: 'view', id: product.id_producto, dataset: 'product', label: 'Visualizar producto', icon: 'bi bi-eye', className: 'btn-action-view' }),
      createActionButton({ action: 'edit', id: product.id_producto, dataset: 'product', label: 'Editar producto', icon: 'bi bi-pencil-square', className: 'btn-action-edit' }),
      toggle,
    );
    return [
      createCell(product.nombre_modelo, `SKU: ${product.sku}`),
      createNumericCell(formatCurrencyPEN(product.precio), 'inventory-price'),
      createNumericCell(formatNumber(product.stock_actual), 'inventory-stock'),
      createStatusCell(product.estado),
      actions,
    ];
  });
  return createTable(['Producto / Modelo', 'Precio', 'Stock', 'Estado', 'Acciones'], rows, { className: 'inventory-product-table' });
}

function addOption(select, value, label, disabled = false) {
  const option = document.createElement('option');
  option.value = String(value);
  option.textContent = label;
  option.disabled = disabled;
  select.append(option);
}

function makeSelect(id, name, placeholder) {
  const select = document.createElement('select');
  select.className = 'input-custom';
  select.id = id;
  select.name = name;
  select.required = true;
  addOption(select, '', placeholder, true);
  return select;
}

function makeField(labelText, control) {
  const field = document.createElement('div');
  const label = document.createElement('label');
  label.className = 'form-label-custom';
  label.htmlFor = control.id;
  label.textContent = labelText;
  field.append(label, control);
  return field;
}

function renderProductDetails(product) {
  const details = document.createElement('dl');
  details.className = 'inventory-product-details';
  [
    ['ID del producto', product.id_producto],
    ['SKU', product.sku],
    ['Modelo relacionado', `${product.nombre_modelo} (#${product.id_modelo})`],
    ['Categoría', product.nombre_categoria],
    ['Diseño', product.nombre_diseno],
    ['Nivel educativo', product.nivel_educativo || '—'],
    ['Precio referencial', formatCurrencyPEN(product.precio)],
    ['Stock actual', formatNumber(product.stock_actual)],
    ['Estado', Number(product.estado) === 1 ? 'Activo' : 'Inactivo'],
  ].forEach(([label, value]) => {
    const item = document.createElement('div');
    const term = document.createElement('dt'); term.textContent = label;
    const description = document.createElement('dd'); description.textContent = String(value ?? '—');
    item.append(term, description);
    details.append(item);
  });
  return details;
}

export function createProductsModule(root, { isActive, onChanged, modal }) {
  const categoryFilter = root.querySelector('#productCategoryFilter');
  const designFilter = root.querySelector('#productDesignFilter');
  const levelFilter = root.querySelector('#productLevelFilter');
  const stateFilter = root.querySelector('#productStateFilter');
  const availabilityFilter = root.querySelector('#productAvailabilityFilter');

  function cached(name) { return appState.catalogos.getStatus(name).data ?? []; }

  function syncFilters() {
    const categories = cached('categorias');
    const designs = cached('disenios');
    const products = cached('productos');
    const categoryOptions = [['', 'Todas las categorías'], ...categories.map((item) => [item.id_categoria, `${item.nombre_categoria}${Number(item.estado) === 1 ? '' : ' (inactiva)'}`])];
    const levels = [...new Set(products.map((item) => String(item.nivel_educativo ?? '').trim()).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right, 'es-PE'));
    const levelOptions = [['', 'Todos los niveles'], ...levels.map((value) => [value, value])];

    function update(select, options, selected) {
      const current = [...select.options].map((option) => [option.value, option.textContent]);
      const normalized = options.map(([value, label]) => [String(value), label]);
      if (JSON.stringify(current) !== JSON.stringify(normalized)) {
        select.replaceChildren(...options.map(([value, label]) => {
          const option = document.createElement('option');
          option.value = String(value); option.textContent = label;
          return option;
        }));
      }
      select.value = options.some(([value]) => String(value) === selected) ? selected : '';
    }

    update(categoryFilter, categoryOptions, productCategoryFilter);
    productCategoryFilter = categoryFilter.value;
    const relatedDesigns = designs.filter((item) => productCategoryFilter === '' || String(item.id_categoria) === productCategoryFilter);
    const designOptions = [['', 'Todos los diseños'], ...relatedDesigns.map((item) => [item.id_diseno, `${item.nombre_diseno}${Number(item.estado) === 1 ? '' : ' (inactivo)'}`])];
    update(designFilter, designOptions, productDesignFilter);
    update(levelFilter, levelOptions, productLevelFilter);
    productDesignFilter = designFilter.value;
    productLevelFilter = levelFilter.value;
    if (productDesignFilter && !designs.some((item) => String(item.id_diseno) === productDesignFilter &&
      (productCategoryFilter === '' || String(item.id_categoria) === productCategoryFilter))) {
      productDesignFilter = '';
      designFilter.value = '';
    }
  }

  async function ensureRelations() {
    try {
      await Promise.all(['categorias', 'disenios', 'modelos'].map((name) => appState.catalogos.get(name)));
      if (isActive()) onChanged({ renderOnly: true });
    } catch (error) {
      showToast(error.message || 'No se pudieron cargar los catálogos relacionados.', 'error');
    }
  }

  async function refreshProducts() {
    try {
      await appState.catalogos.reload('productos');
      await onChanged({ renderOnly: true, refreshStats: true });
      return true;
    } catch {
      await onChanged({ renderOnly: true, refreshStats: true });
      return false;
    }
  }

  async function openProductForm(product = null) {
    let categories;
    let designs;
    let models;
    try {
      [categories, designs, models] = await Promise.all(['categorias', 'disenios', 'modelos'].map((name) => appState.catalogos.get(name)));
    } catch (error) {
      showToast(error.message || 'No se pudieron cargar los catálogos relacionados.', 'error');
      return;
    }

    const isEdit = Boolean(product);
    const currentModel = isEdit ? models.find((item) => String(item.id_modelo) === String(product.id_modelo)) : null;
    const currentDesign = currentModel ? designs.find((item) => String(item.id_diseno) === String(currentModel.id_diseno)) : null;
    const currentCategory = currentDesign ? categories.find((item) => String(item.id_categoria) === String(currentDesign.id_categoria)) : null;
    const relationLocked = isEdit && Number(product.tiene_referencias_operativas) === 1;
    const form = document.createElement('form');
    form.id = 'productForm'; form.className = 'form-stack'; form.noValidate = true;
    const requestError = document.createElement('p');
    requestError.className = 'field-error'; requestError.setAttribute('role', 'alert'); requestError.hidden = true;

    const category = makeSelect('productCategoryInput', 'id_categoria', 'Selecciona una categoría activa');
    categories.filter((item) => Number(item.estado) === 1).forEach((item) => addOption(category, item.id_categoria, item.nombre_categoria));
    if (currentCategory && Number(currentCategory.estado) !== 1) addOption(category, currentCategory.id_categoria, `${currentCategory.nombre_categoria} (inactiva; histórica)`, true);
    category.value = String(currentCategory?.id_categoria ?? '');

    const design = makeSelect('productDesignInput', 'id_diseno', 'Selecciona un diseño activo');
    const model = makeSelect('productModelInput', 'id_modelo', 'Selecciona un modelo activo');

    function populateModels() {
      const selectedDesignId = design.value;
      model.replaceChildren(); addOption(model, '', 'Selecciona un modelo activo', true);
      models.filter((item) => String(item.id_diseno) === selectedDesignId && Number(item.estado) === 1 &&
        Number(item.estado_diseno ?? 1) === 1 && Number(item.estado_categoria ?? 1) === 1)
        .forEach((item) => addOption(model, item.id_modelo, item.nombre_modelo));
      if (currentModel && String(currentModel.id_diseno) === selectedDesignId &&
        (Number(currentModel.estado) !== 1 || Number(currentModel.estado_diseno ?? 1) !== 1 || Number(currentModel.estado_categoria ?? 1) !== 1)) {
        addOption(model, currentModel.id_modelo, `${currentModel.nombre_modelo} (inactivo; histórico)`, true);
      }
      model.value = isEdit && String(currentModel?.id_diseno) === selectedDesignId ? String(product.id_modelo) : '';
    }

    function populateDesigns() {
      const selectedCategoryId = category.value;
      design.replaceChildren(); addOption(design, '', 'Selecciona un diseño activo', true);
      designs.filter((item) => String(item.id_categoria) === selectedCategoryId && Number(item.estado) === 1 && Number(item.estado_categoria ?? 1) === 1)
        .forEach((item) => addOption(design, item.id_diseno, item.nombre_diseno));
      if (currentDesign && String(currentDesign.id_categoria) === selectedCategoryId &&
        (Number(currentDesign.estado) !== 1 || Number(currentCategory?.estado) !== 1)) {
        addOption(design, currentDesign.id_diseno, `${currentDesign.nombre_diseno} (inactivo; histórico)`, true);
      }
      design.value = isEdit && String(currentDesign?.id_categoria) === selectedCategoryId ? String(product.id_diseno) : '';
      populateModels();
    }
    populateDesigns();
    if (relationLocked) {
      category.disabled = true; design.disabled = true; model.disabled = true;
    }

    const sku = document.createElement('input');
    sku.className = 'input-custom'; sku.id = 'productSkuInput'; sku.name = 'sku'; sku.type = 'text'; sku.required = true;
    sku.maxLength = 30; sku.autocomplete = 'off'; sku.value = product?.sku ?? '';
    const price = document.createElement('input');
    price.className = 'input-custom'; price.id = 'productPriceInput'; price.name = 'precio'; price.type = 'number';
    price.required = true; price.min = '0'; price.max = '999.99'; price.step = '0.01'; price.value = product?.precio ?? '';

    const categoryField = makeField('Categoría', category);
    const designField = makeField('Diseño', design);
    const modelField = makeField('Modelo', model);
    const skuField = makeField('SKU', sku);
    const priceField = makeField('Precio referencial (S/)', price);
    const categoryError = document.createElement('span'); categoryError.className = 'field-error'; categoryError.setAttribute('role', 'alert');
    const designError = document.createElement('span'); designError.className = 'field-error'; designError.setAttribute('role', 'alert');
    const modelError = document.createElement('span'); modelError.className = 'field-error'; modelError.setAttribute('role', 'alert');
    const skuError = document.createElement('span'); skuError.className = 'field-error'; skuError.setAttribute('role', 'alert');
    const priceError = document.createElement('span'); priceError.className = 'field-error'; priceError.setAttribute('role', 'alert');
    categoryField.append(categoryError); designField.append(designError); modelField.append(modelError); skuField.append(skuError); priceField.append(priceError);
    if (relationLocked) {
      const note = document.createElement('small'); note.className = 'inventory-product-note';
      note.textContent = 'El modelo no se puede cambiar porque el producto tiene movimientos o dependencias operativas.';
      modelField.append(note);
    } else if (currentModel && (Number(currentModel.estado) !== 1 || Number(currentModel.estado_diseno ?? 1) !== 1 || Number(currentModel.estado_categoria ?? 1) !== 1)) {
      const note = document.createElement('small'); note.className = 'inventory-product-note';
      note.textContent = 'La relación inactiva se conserva para este producto histórico; puedes reasignar solo a un modelo activo.';
      modelField.append(note);
    }
    form.append(requestError, categoryField, designField, modelField, skuField, priceField);

    category.addEventListener('change', () => { populateDesigns(); categoryError.textContent = ''; designError.textContent = ''; modelError.textContent = ''; });
    design.addEventListener('change', () => { populateModels(); designError.textContent = ''; modelError.textContent = ''; });
    [sku, price].forEach((input) => input.addEventListener('input', () => { requestError.hidden = true; }));

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const normalizedSku = sku.value.trim();
      const priceValue = price.value.trim();
      [categoryError, designError, modelError, skuError, priceError].forEach((error) => { error.textContent = ''; });
      requestError.hidden = true;
      const missing = validateRequiredFields({ id_categoria: category.value, id_diseno: design.value, id_modelo: model.value, sku: normalizedSku, precio: priceValue });
      if (missing.includes('id_categoria')) { categoryError.textContent = 'Selecciona una categoría activa.'; category.focus(); return; }
      if (missing.includes('id_diseno')) { designError.textContent = 'Selecciona un diseño activo.'; design.focus(); return; }
      if (missing.includes('id_modelo')) { modelError.textContent = 'Selecciona un modelo activo.'; model.focus(); return; }
      if (missing.includes('sku')) { skuError.textContent = 'El SKU es obligatorio.'; sku.focus(); return; }
      if (Array.from(normalizedSku).length > 30) { skuError.textContent = 'El SKU admite hasta 30 caracteres.'; sku.focus(); return; }
      if (missing.includes('precio') || !/^\d+(?:\.\d{1,2})?$/.test(priceValue) || Number(priceValue) > 999.99) {
        priceError.textContent = 'Ingresa un precio entre 0 y 999.99, con hasta dos decimales.'; price.focus(); return;
      }
      const selectedModel = models.find((item) => String(item.id_modelo) === model.value);
      const retainsHistoricalModel = isEdit && String(product.id_modelo) === model.value;
      if (!selectedModel || (!retainsHistoricalModel && (Number(selectedModel.estado) !== 1 || Number(selectedModel.estado_diseno ?? 1) !== 1 || Number(selectedModel.estado_categoria ?? 1) !== 1))) {
        modelError.textContent = 'Selecciona un modelo activo con diseño y categoría activos.'; model.focus(); return;
      }
      if (String(selectedModel.id_diseno) !== design.value || String(selectedModel.id_categoria) !== category.value) {
        modelError.textContent = 'El modelo debe pertenecer al diseño y categoría seleccionados.'; model.focus(); return;
      }

      const submit = root.querySelector('#inventoryModalFooter [type="submit"]');
      submit.disabled = true; form.setAttribute('aria-busy', 'true');
      try {
        const response = await http(isEdit ? `/api/inventario-productos/${encodeURIComponent(product.id_producto)}` : '/api/inventario-productos', isEdit ? 'PUT' : 'POST', {
          id_modelo: Number(model.value), sku: normalizedSku, precio: priceValue,
        });
        modal.close();
        showToast(response.message || (isEdit ? 'Producto actualizado correctamente.' : 'Producto creado correctamente.'), 'success');
        if (!await refreshProducts()) showToast('El cambio se guardó, pero no se pudo actualizar el listado y los indicadores.', 'warning');
      } catch (error) {
        requestError.hidden = false; requestError.textContent = error.message || 'No se pudo guardar el producto.';
        showToast(error.message || 'No se pudo guardar el producto.', 'error');
      } finally {
        form.removeAttribute('aria-busy'); if (submit.isConnected) submit.disabled = false;
      }
    });

    const submit = document.createElement('button');
    submit.type = 'submit'; submit.className = 'btn-primary-action'; submit.setAttribute('form', form.id);
    submit.textContent = isEdit ? 'Guardar cambios' : 'Guardar producto';
    modal.open(isEdit ? 'Editar producto' : 'Nuevo producto', 'El stock se controla exclusivamente mediante operaciones de inventario.', form, [
      modal.createButton('Cancelar', 'btn-cancel', () => modal.close()), submit,
    ]);
  }

  async function changeState(product, state, button = null) {
    if (button?.disabled) return;
    if (button) button.disabled = true;
    try {
      const response = await http(`/api/inventario-productos/${encodeURIComponent(product.id_producto)}/estado`, 'PATCH', { estado: state });
      if (state === 0) modal.close();
      showToast(response.message || (state === 1 ? 'Producto activado correctamente.' : 'Producto desactivado correctamente.'), 'success');
      if (!await refreshProducts()) showToast('El estado se guardó, pero no se pudo actualizar el listado y los indicadores.', 'warning');
    } catch (error) {
      const detail = root.querySelector('#productModalError');
      if (detail) { detail.hidden = false; detail.textContent = error.message; }
      showToast(error.message || 'No se pudo cambiar el estado del producto.', 'error');
    } finally { if (button?.isConnected) button.disabled = false; }
  }

  function confirmDeactivation(product) {
    const content = document.createElement('div');
    const message = document.createElement('p'); message.className = 'category-confirm-message';
    message.append(document.createTextNode('¿Deseas desactivar el producto '));
    const name = document.createElement('strong'); name.textContent = `${product.nombre_modelo} (${product.sku})`;
    message.append(name, document.createTextNode('? No se eliminará el registro ni su historial.'));
    const error = document.createElement('p'); error.className = 'field-error'; error.id = 'productModalError'; error.setAttribute('role', 'alert'); error.hidden = true;
    content.append(message, error);
    const deactivate = modal.createButton('Desactivar', 'btn-danger-action', () => { void changeState(product, 0, deactivate); });
    modal.open('Confirmar desactivación', 'No se podrá desactivar mientras el producto tenga stock disponible.', content, [
      modal.createButton('Cancelar', 'btn-cancel', () => modal.close()), deactivate,
    ]);
  }

  function handleAction(action, id, button) {
    const product = cached('productos').find((item) => String(item.id_producto) === String(id));
    if (!product) { showToast('El producto ya no está disponible. Actualiza el listado.', 'warning'); return; }
    if (action === 'view') {
      modal.open(`Producto #${product.id_producto}`, 'Detalle informativo del producto.', renderProductDetails(product), [modal.createButton('Cerrar', 'btn-cancel', () => modal.close())]);
    } else if (action === 'edit') void openProductForm(product);
    else if (Number(product.estado) === 1) confirmDeactivation(product);
    else if (Number(product.estado_modelo) !== 1 || Number(product.estado_diseno) !== 1 || Number(product.estado_categoria) !== 1) {
      showToast('No se puede activar el producto porque su modelo, diseño o categoría está inactivo.', 'error');
    } else void changeState(product, 1, button);
  }

  root.querySelector('#productCreateButton').addEventListener('click', () => { void openProductForm(); });
  categoryFilter.addEventListener('change', () => {
    productCategoryFilter = categoryFilter.value;
    if (productDesignFilter && !cached('disenios').some((item) => String(item.id_diseno) === productDesignFilter &&
      (productCategoryFilter === '' || String(item.id_categoria) === productCategoryFilter))) productDesignFilter = '';
    if (isActive()) onChanged({ renderOnly: true });
  });
  designFilter.addEventListener('change', () => { productDesignFilter = designFilter.value; if (isActive()) onChanged({ renderOnly: true }); });
  levelFilter.addEventListener('change', () => { productLevelFilter = levelFilter.value; if (isActive()) onChanged({ renderOnly: true }); });
  stateFilter.addEventListener('change', () => { productStateFilter = stateFilter.value; if (isActive()) onChanged({ renderOnly: true }); });
  availabilityFilter.addEventListener('change', () => { productAvailabilityFilter = availabilityFilter.value; if (isActive()) onChanged({ renderOnly: true }); });

  return {
    setVisible(visible) {
      [categoryFilter, designFilter, levelFilter, stateFilter, availabilityFilter].forEach((select) => { select.hidden = !visible; select.disabled = !visible; });
      root.querySelector('#productCreateButton').hidden = !visible;
      if (visible) void ensureRelations();
      syncFilters();
    },
    getSearch() { return productSearch; },
    setSearch(value) { productSearch = value; },
    handleAction,
    render() {
      syncFilters();
      return renderProductTable(filterProducts(cached('productos'), {
        search: productSearch, categoryId: productCategoryFilter, designId: productDesignFilter,
        level: productLevelFilter, state: productStateFilter, availability: productAvailabilityFilter,
      }));
    },
  };
}
