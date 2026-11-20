import { appState } from '../../appState.js';
import { http, showToast, validateRequiredFields } from '../../utils.js';
import { createActionButton, createCell, createNumericCell, createStatusCell, createTable } from '../../components/inventoryTable.js';

let designSearch = '';
let designCategoryFilter = '';
let designStateFilter = '';
let modelCountsWarningShown = false;

function modelCount(value) {
  if (value === null || value === undefined || value === '') return null;
  const count = Number(value);
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

export function filterDesigns(designs, { search = '', categoryId = '', state = '' } = {}) {
  const normalizedSearch = search.trim().toLocaleLowerCase('es-PE');
  return designs.filter((design) => {
    const matchesName = String(design.nombre_diseno ?? '').toLocaleLowerCase('es-PE').includes(normalizedSearch);
    const matchesCategory = categoryId === '' || String(design.id_categoria) === categoryId;
    const matchesState = state === '' || String(design.estado) === state;
    return matchesName && matchesCategory && matchesState;
  });
}

function renderDesignTable(designs) {
  const rows = designs.map((design) => {
    const active = Number(design.estado) === 1;
    const inactiveCategory = Number(design.estado_categoria) === 0;
    const totalModels = modelCount(design.total_modelos);
    const actions = document.createElement('td');
    actions.className = 'inventory-design-actions';
    const stateButton = createActionButton({
      action: 'toggle', id: design.id_diseno, dataset: 'design',
      label: active ? 'Desactivar diseño' : inactiveCategory ? 'No se puede activar: la categoría está inactiva' : 'Activar diseño',
      icon: active ? 'bi bi-toggle-on' : 'bi bi-toggle-off',
      className: active ? 'inventory-state-off' : 'inventory-state-on',
    });
    stateButton.disabled = !active && inactiveCategory;
    actions.append(
      createActionButton({
        action: 'edit', id: design.id_diseno, dataset: 'design', label: 'Editar diseño',
        icon: 'bi bi-pencil-square', className: 'btn-action-edit',
      }),
      stateButton,
    );

    return [
      createCell(design.nombre_diseno, `ID: ${design.id_diseno}`),
      createCell(design.nombre_categoria, `Categoría #${design.id_categoria}${inactiveCategory ? ' · Inactiva (histórica)' : ''}`),
      createCell(design.nombre_proveedor || 'Sin proveedor'),
      createNumericCell(totalModels, 'inventory-design-count'),
      createStatusCell(design.estado),
      actions,
    ];
  });

  return createTable(
    ['Diseño', 'Categoría', 'Proveedor', 'Modelos asociados', 'Estado', 'Acciones'],
    rows,
    { className: 'inventory-design-table' },
  );
}

export function createDesignsModule(root, { isActive, onChanged, modal }) {
  const search = root.querySelector('#inventory-search');
  const categoryFilter = root.querySelector('#designCategoryFilter');
  const stateFilter = root.querySelector('#designStateFilter');
  const panel = root.querySelector('#inventory-panel');

  function cachedCategories() {
    return appState.catalogos.getStatus('categorias').data ?? [];
  }

  function syncCategoryFilterOptions() {
    const selected = designCategoryFilter;
    const categories = cachedCategories();
    const options = [['', 'Todas las categorías'], ...categories.map((category) => [
      String(category.id_categoria),
      `${category.nombre_categoria}${Number(category.estado) === 1 ? '' : ' (inactiva)'}`,
    ])];
    const current = [...categoryFilter.options].map(({ value, textContent }) => [value, textContent]);
    if (JSON.stringify(current) !== JSON.stringify(options)) {
      categoryFilter.replaceChildren(...options.map(([value, label]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        return option;
      }));
    }
    categoryFilter.value = options.some(([value]) => value === selected) ? selected : '';
    designCategoryFilter = categoryFilter.value;
  }

  async function refreshAfterMutation({ categoryCountsChanged = false, labelsChanged = false } = {}) {
    if (labelsChanged) {
      appState.catalogos.invalidate('modelos');
    }
    try {
      const reloads = [appState.catalogos.reload('disenios')];
      if (categoryCountsChanged) reloads.push(appState.catalogos.reload('categorias'));
      await Promise.all(reloads);
      await onChanged();
      return true;
    } catch {
      await onChanged();
      return false;
    }
  }

  async function openDesignForm(design = null) {
    let categories;
    let suppliers;
    try {
      const [categorias, response] = await Promise.all([appState.catalogos.get('categorias'), http('/api/proveedores')]);
      categories = categorias; suppliers = response.data;
    } catch (error) {
      showToast(error.message || 'No se pudieron cargar las categorías.', 'error');
      return;
    }

    const isEdit = Boolean(design);
    const currentCategory = isEdit
      ? categories.find((category) => String(category.id_categoria) === String(design.id_categoria))
      : null;
    const availableCategories = categories.filter((category) => Number(category.estado) === 1);
    const form = document.createElement('form');
    form.id = 'designForm';
    form.className = 'form-stack';
    form.noValidate = true;
    const requestError = document.createElement('p');
    requestError.className = 'field-error';
    requestError.setAttribute('role', 'alert');
    requestError.hidden = true;
    form.append(requestError);

    const nameField = document.createElement('div');
    const nameLabel = document.createElement('label');
    nameLabel.className = 'form-label-custom';
    nameLabel.htmlFor = 'designNameInput';
    nameLabel.textContent = 'Nombre del diseño';
    const nameInput = document.createElement('input');
    nameInput.className = 'input-custom';
    nameInput.id = 'designNameInput';
    nameInput.name = 'nombre_diseno';
    nameInput.type = 'text';
    nameInput.autocomplete = 'off';
    nameInput.required = true;
    nameInput.setAttribute('aria-describedby', 'designNameError');
    nameInput.value = design?.nombre_diseno ?? '';
    const nameError = document.createElement('span');
    nameError.className = 'field-error';
    nameError.id = 'designNameError';
    nameError.setAttribute('role', 'alert');
    const nameCounter = document.createElement('div');
    nameCounter.className = 'char-counter';
    const updateNameCounter = () => { nameCounter.textContent = `${Array.from(nameInput.value.trim()).length}/30 caracteres`; };
    nameInput.addEventListener('input', () => {
      nameInput.classList.remove('is-invalid');
      nameInput.removeAttribute('aria-invalid');
      nameError.textContent = '';
      requestError.hidden = true;
      updateNameCounter();
    });
    updateNameCounter();
    nameField.append(nameLabel, nameInput, nameError, nameCounter);

    const categoryField = document.createElement('div');
    const categoryLabel = document.createElement('label');
    categoryLabel.className = 'form-label-custom';
    categoryLabel.htmlFor = 'designCategoryInput';
    categoryLabel.textContent = 'Categoría';
    const categoryInput = document.createElement('select');
    categoryInput.className = 'input-custom';
    categoryInput.id = 'designCategoryInput';
    categoryInput.name = 'id_categoria';
    categoryInput.required = true;
    categoryInput.setAttribute('aria-describedby', 'designCategoryError');
    const categoryPlaceholder = document.createElement('option');
    categoryPlaceholder.value = '';
    categoryPlaceholder.textContent = availableCategories.length ? 'Selecciona una categoría activa' : 'No hay categorías activas';
    categoryPlaceholder.disabled = true;
    categoryInput.append(categoryPlaceholder);
    availableCategories.forEach((category) => {
      const option = document.createElement('option');
      option.value = String(category.id_categoria);
      option.textContent = category.nombre_categoria;
      categoryInput.append(option);
    });
    if (currentCategory && Number(currentCategory.estado) !== 1) {
      const option = document.createElement('option');
      option.value = String(currentCategory.id_categoria);
      option.textContent = `${currentCategory.nombre_categoria} (inactiva; asignación histórica)`;
      option.disabled = true;
      categoryInput.append(option);
    }
    categoryInput.value = String(design?.id_categoria ?? '');
    const categoryError = document.createElement('span');
    categoryError.className = 'field-error';
    categoryError.id = 'designCategoryError';
    categoryError.setAttribute('role', 'alert');
    categoryInput.addEventListener('change', () => {
      categoryInput.classList.remove('is-invalid');
      categoryInput.removeAttribute('aria-invalid');
      categoryError.textContent = '';
      requestError.hidden = true;
    });
    categoryField.append(categoryLabel, categoryInput, categoryError);
    if (currentCategory && Number(currentCategory.estado) !== 1) {
      const note = document.createElement('small');
      note.className = 'inventory-design-note';
      note.textContent = 'La categoría inactiva se conserva para este diseño histórico; elige una activa solo si quieres reasignarlo.';
      categoryField.append(note);
    }

    const supplierField = document.createElement('div');
    const supplierLabel = document.createElement('label');
    supplierLabel.className = 'form-label-custom'; supplierLabel.htmlFor = 'designSuppliersInput';
    supplierLabel.textContent = 'Proveedor del diseño';
    const supplierInput = document.createElement('select');
    supplierInput.className = 'input-custom'; supplierInput.id = 'designSuppliersInput';
    supplierInput.name = 'id_proveedor';
    supplierInput.required = true;
    supplierInput.setAttribute('aria-describedby', 'designSupplierError');
    const selectedSupplierId = design?.id_proveedor ?? '';

    const currentSupplier = design && !suppliers.some(
      (supplier) => Number(supplier.id_proveedor) === Number(design.id_proveedor)
    ) ? {
      id_proveedor: design.id_proveedor,
      razon_social: design.nombre_proveedor,
      estado: design.estado_proveedor
    } : null;

    const options = currentSupplier ? [...suppliers, currentSupplier] : suppliers;

    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = options.length ? 'Selecciona un proveedor activo' : 'No hay proveedores activos';
    placeholder.disabled = true;
    placeholder.selected = !selectedSupplierId;
    supplierInput.append(placeholder);

    options.forEach((supplier) => {
      const option = document.createElement('option');
      option.value = String(supplier.id_proveedor);
      option.textContent = supplier.razon_social +
        (supplier.estado === 'Inactivo' ? ' (inactivo)' : '');
      option.selected = Number(supplier.id_proveedor) === Number(selectedSupplierId);
      supplierInput.append(option);
    });
    const supplierError = document.createElement('span');
    supplierError.className = 'field-error';
    supplierError.id = 'designSupplierError';
    supplierError.setAttribute('role', 'alert');
    supplierInput.addEventListener('change', () => {
      supplierInput.classList.remove('is-invalid');
      supplierInput.removeAttribute('aria-invalid');
      supplierError.textContent = '';
      requestError.hidden = true;
    });
    const supplierNote = document.createElement('small');
    supplierNote.textContent = currentSupplier?.estado === 'Inactivo'
      ? 'Este proveedor está inactivo y se conserva solo como relación histórica. Para cambiarlo, selecciona un proveedor activo.'
      : 'Cada diseño pertenece a un único proveedor; sus modelos heredan esta relación para las compras.';
    supplierField.append(supplierLabel, supplierInput, supplierError, supplierNote);
    form.append(nameField, categoryField, supplierField);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const name = nameInput.value.trim();
      const categoryId = Number(categoryInput.value);
      nameError.textContent = '';
      categoryError.textContent = '';
      supplierError.textContent = '';

      const missing = validateRequiredFields({ nombre_diseno: name, id_categoria: categoryInput.value });
      if (missing.includes('nombre_diseno')) {
        nameInput.classList.add('is-invalid');
        nameInput.setAttribute('aria-invalid', 'true');
        nameError.textContent = 'El nombre del diseño es obligatorio.';
        nameInput.focus();
        return;
      }
      if (Array.from(name).length > 30) {
        nameInput.classList.add('is-invalid');
        nameInput.setAttribute('aria-invalid', 'true');
        nameError.textContent = 'El nombre del diseño no debe superar los 30 caracteres.';
        nameInput.focus();
        return;
      }
      if (missing.includes('id_categoria') || !Number.isSafeInteger(categoryId) || categoryId <= 0) {
        categoryInput.classList.add('is-invalid');
        categoryInput.setAttribute('aria-invalid', 'true');
        categoryError.textContent = 'Selecciona una categoría activa.';
        categoryInput.focus();
        return;
      }
      const isHistoricalCategory = isEdit && String(design.id_categoria) === String(categoryId) &&
        currentCategory && Number(currentCategory.estado) !== 1;
      if (!availableCategories.some((category) => Number(category.id_categoria) === categoryId) && !isHistoricalCategory) {
        categoryInput.classList.add('is-invalid');
        categoryInput.setAttribute('aria-invalid', 'true');
        categoryError.textContent = 'Selecciona una categoría activa.';
        categoryInput.focus();
        return;
      }

      const supplierId = Number(supplierInput.value);
      const isHistoricalSupplier = isEdit && Number(design.id_proveedor) === supplierId &&
        currentSupplier?.estado === 'Inactivo';
      if (!Number.isSafeInteger(supplierId) || supplierId <= 0 ||
          (!suppliers.some((supplier) => Number(supplier.id_proveedor) === supplierId) && !isHistoricalSupplier)) {
        supplierInput.classList.add('is-invalid');
        supplierInput.setAttribute('aria-invalid', 'true');
        supplierError.textContent = 'Selecciona un proveedor activo.';
        supplierInput.focus();
        return;
      }

      const submit = root.querySelector('#inventoryModalFooter [type="submit"]');
      submit.disabled = true;
      form.setAttribute('aria-busy', 'true');
      try {
        const url = isEdit ? `/api/disenios/${encodeURIComponent(design.id_diseno)}` : '/api/disenios';
        const response = await http(url, isEdit ? 'PUT' : 'POST', {
          id_categoria: categoryId,
          id_proveedor: supplierId,
          nombre_diseno: name,
        });
        modal.close();
        showToast(response.message || (isEdit ? 'Diseño actualizado correctamente.' : 'Diseño creado correctamente.'), 'success');
        const categoryChanged = isEdit && String(design.id_categoria) !== String(categoryId);
        const supplierChanged = isEdit && Number(design.id_proveedor) !== supplierId;
        const labelsChanged = isEdit && (categoryChanged || supplierChanged || design.nombre_diseno !== name);
        if (!await refreshAfterMutation({ categoryCountsChanged: !isEdit || categoryChanged, labelsChanged })) {
          showToast('El cambio se guardó, pero no se pudo actualizar el listado. Intenta recargarlo.', 'warning');
        }
      } catch (error) {
        requestError.hidden = false;
        requestError.textContent = error.message || 'No se pudo guardar el diseño.';
        showToast(error.message || 'No se pudo guardar el diseño.', 'error');
      } finally {
        form.removeAttribute('aria-busy');
        if (submit.isConnected) submit.disabled = false;
      }
    });

    const cancel = modal.createButton('Cancelar', 'btn-cancel', () => modal.close());
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'btn-primary-action';
    submit.dataset.requiresPermission = isEdit ? 'disenios.editar' : 'disenios.registrar';
    submit.setAttribute('form', form.id);
    submit.textContent = isEdit ? 'Guardar cambios' : 'Guardar diseño';
    submit.disabled = !isEdit && (availableCategories.length === 0 || suppliers.length === 0);
    modal.open(isEdit ? 'Editar diseño' : 'Nuevo diseño', 'El nombre admite hasta 30 caracteres. Selecciona un único proveedor activo.', form, [cancel, submit]);
    nameInput.focus();
  }

  async function changeDesignState(design, state, actionButton = null) {
    if (actionButton?.disabled) return;
    if (actionButton) actionButton.disabled = true;
    try {
      const response = await http(`/api/disenios/${encodeURIComponent(design.id_diseno)}/estado`, 'PATCH', { estado: state });
      if (state === 0) modal.close();
      showToast(response.message || (state === 1 ? 'Diseño activado correctamente.' : 'Diseño desactivado correctamente.'), 'success');
      if (!await refreshAfterMutation()) showToast('El cambio se guardó, pero no se pudo actualizar el listado. Intenta recargarlo.', 'warning');
    } catch (error) {
      const modalError = root.querySelector('#designModalError');
      if (modalError) {
        modalError.hidden = false;
        modalError.textContent = error.message;
      }
      showToast(error.message || 'No se pudo cambiar el estado del diseño.', 'error');
    } finally {
      if (actionButton?.isConnected) actionButton.disabled = false;
    }
  }

  function confirmDeactivation(design) {
    const content = document.createElement('div');
    const message = document.createElement('p');
    message.className = 'category-confirm-message';
    message.append(document.createTextNode('¿Deseas desactivar el diseño '));
    const name = document.createElement('strong');
    name.textContent = design.nombre_diseno;
    message.append(name, document.createTextNode('? No se eliminará el registro ni sus relaciones.'));
    const error = document.createElement('p');
    error.className = 'field-error';
    error.id = 'designModalError';
    error.setAttribute('role', 'alert');
    error.hidden = true;
    content.append(message, error);
    const cancel = modal.createButton('Cancelar', 'btn-cancel', () => modal.close());
    const deactivate = modal.createButton('Desactivar', 'btn-danger-action', () => changeDesignState(design, 0, deactivate));
    deactivate.dataset.requiresPermission = 'disenios.cambiar_estado';
    modal.open('Confirmar desactivación', 'No se podrá desactivar mientras existan modelos activos asociados.', content, [cancel, deactivate]);
  }

  function handleDesignAction(action, id, actionButton) {
    const designs = appState.catalogos.getStatus('disenios').data ?? [];
    const design = designs.find((item) => String(item.id_diseno) === String(id));
    if (!design) {
      showToast('El diseño ya no está disponible. Actualiza el listado.', 'warning');
      return;
    }
    if (action === 'edit') void openDesignForm(design);
    else if (action === 'toggle' && Number(design.estado) === 1) confirmDeactivation(design);
    else if (action === 'toggle') void changeDesignState(design, 1, actionButton);
  }

  root.querySelector('#designCreateButton').addEventListener('click', () => { void openDesignForm(); });
  categoryFilter.addEventListener('change', () => {
    designCategoryFilter = categoryFilter.value;
    if (isActive()) onChanged({ renderOnly: true });
  });
  stateFilter.addEventListener('change', () => {
    designStateFilter = stateFilter.value;
    if (isActive()) onChanged({ renderOnly: true });
  });

  return {
    setVisible(visible) {
      syncCategoryFilterOptions();
      categoryFilter.hidden = !visible;
      categoryFilter.disabled = !visible;
      stateFilter.hidden = !visible;
      stateFilter.disabled = !visible;
      stateFilter.value = designStateFilter;
      root.querySelector('#designCreateButton').hidden = !visible;
    },
    getSearch() { return designSearch; },
    setSearch(value) { designSearch = value; },
    handleAction: handleDesignAction,
    render() {
      syncCategoryFilterOptions();
      const { data = [] } = appState.catalogos.getStatus('disenios');
      const hasInvalidCounts = data.some((design) => modelCount(design.total_modelos) === null);
      if (hasInvalidCounts && !modelCountsWarningShown) {
        showToast('La API de diseños no devolvió el conteo de modelos esperado; los valores se muestran como no disponibles.', 'error');
      }
      modelCountsWarningShown = hasInvalidCounts;
      return renderDesignTable(filterDesigns(data, {
        search: designSearch,
        categoryId: designCategoryFilter,
        state: designStateFilter,
      }));
    },
  };
}
