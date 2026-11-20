import { appState } from '../../appState.js';
import { http, showToast, validateRequiredFields, formatCurrencyPEN } from '../../utils.js';
import { createActionButton, createCell, createStatusCell, createTable } from '../../components/inventoryTable.js';

let modelSearch = '';
let modelCategoryFilter = '';
let modelProviderFilter = '';
let modelDesignFilter = '';
let modelLevelFilter = '';
let modelStateFilter = '';
const EDUCATION_LEVELS = ['PRONOEI - Inicial', 'Primaria - Superior'];
const MODEL_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const MODEL_IMAGE_EXTENSIONS = new Map([['jpg', 'image/jpeg'], ['jpeg', 'image/jpeg'], ['png', 'image/png'], ['webp', 'image/webp']]);

export function validateModelImageFile(file) {
  if (!file) return null;
  if (file.size <= 0) return 'La imagen está vacía.';
  if (file.size > MODEL_IMAGE_MAX_BYTES) return 'La imagen no puede superar los 5 MB.';
  const extension = String(file.name ?? '').split('.').pop().toLowerCase();
  const expectedType = MODEL_IMAGE_EXTENSIONS.get(extension);
  if (!expectedType || (file.type && file.type !== expectedType)) {
    return 'Formato no válido. Selecciona una imagen JPG, PNG o WEBP.';
  }
  return null;
}

export function filterModels(models, { search = '', categoryId = '', providerId = '', designId = '', level = '', state = '' } = {}) {
  const query = search.trim().toLocaleLowerCase('es-PE');
  return models.filter((model) =>
    String(model.nombre_modelo ?? '').toLocaleLowerCase('es-PE').includes(query) &&
    (categoryId === '' || String(model.id_categoria) === categoryId) &&
    (providerId === '' || String(model.id_proveedor) === providerId) &&
    (designId === '' || String(model.id_diseno) === designId) &&
    (level === '' || String(model.nivel_educativo ?? '') === level) &&
    (state === '' || String(model.estado) === state));
}

export function getDependentModelFilterOptions(designs, { categoryId = '', providerId = '' } = {}) {
  const categoryDesigns = designs.filter((item) => categoryId === '' || String(item.id_categoria) === categoryId);
  const providersById = new Map();
  categoryDesigns.forEach((item) => {
    if (item.id_proveedor != null) providersById.set(String(item.id_proveedor), item.nombre_proveedor || `Proveedor ${item.id_proveedor}`);
  });
  const providers = [...providersById]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'es-PE'));
  const selectedProviderId = providersById.has(providerId) ? providerId : '';
  const eligibleDesigns = categoryDesigns.filter((item) =>
    selectedProviderId === '' || String(item.id_proveedor) === selectedProviderId);
  return { providers, designs: eligibleDesigns, providerId: selectedProviderId };
}

function renderModels(models) {
  const imageCell = (model) => {
    const cell = document.createElement('td');
    cell.className = 'inventory-model-image-cell';
    if (model.imagen_url) {
      const image = document.createElement('img');
      image.className = 'inventory-model-thumbnail';
      image.src = model.imagen_url;
      image.alt = `Imagen de ${model.nombre_modelo}`;
      image.loading = 'lazy';
      cell.append(image);
    } else {
      const empty = document.createElement('span');
      empty.className = 'inventory-model-image-missing';
      empty.textContent = 'Sin imagen';
      cell.append(empty);
    }
    return cell;
  };
  const rows = models.map((model) => {
    const active = Number(model.estado) === 1;
    const inactiveRelation = Number(model.estado_diseno) === 0 || Number(model.estado_categoria) === 0;
    const actions = document.createElement('td');
    actions.className = 'inventory-model-actions';
    const toggle = createActionButton({
      action: 'toggle', id: model.id_modelo, dataset: 'model',
      label: active ? 'Desactivar modelo' : inactiveRelation ? 'No se puede activar: el diseño o categoría está inactivo' : 'Activar modelo',
      icon: active ? 'bi bi-toggle-on' : 'bi bi-toggle-off',
      className: active ? 'inventory-state-off' : 'inventory-state-on',
    });
    toggle.disabled = !active && inactiveRelation;
    actions.append(
      createActionButton({ action: 'view', id: model.id_modelo, dataset: 'model', label: 'Visualizar modelo', icon: 'bi bi-eye', className: 'btn-action-view' }),
      createActionButton({ action: 'edit', id: model.id_modelo, dataset: 'model', label: 'Editar modelo', icon: 'bi bi-pencil-square', className: 'btn-action-edit' }),
      toggle,
    );
    return [
      imageCell(model),
      createCell(model.nombre_modelo, `ID: ${model.id_modelo}`),
      createCell(model.nivel_educativo || '—'),
      createCell(model.precio == null ? 'Pendiente de asignar' : formatCurrencyPEN(model.precio)),
      createStatusCell(model.estado),
      actions,
    ];
  });
  return createTable(['Imagen', 'Modelo', 'Nivel educativo', 'Precio', 'Estado', 'Acciones'], rows, { className: 'inventory-model-table' });
}

function appendOption(select, value, label, disabled = false) {
  const option = document.createElement('option');
  option.value = String(value);
  option.textContent = label;
  option.disabled = disabled;
  select.append(option);
}

function makeField(labelText, id, control) {
  const field = document.createElement('div');
  const label = document.createElement('label');
  label.className = 'form-label-custom';
  label.htmlFor = id;
  label.textContent = labelText;
  field.append(label, control);
  return field;
}

function makeSelect(id, name, placeholder) {
  const select = document.createElement('select');
  select.className = 'input-custom';
  select.id = id;
  select.name = name;
  select.required = true;
  appendOption(select, '', placeholder, true);
  return select;
}

function renderDetails(model) {
  const content = document.createElement('div');
  content.className = 'inventory-model-detail-content';
  const imageBlock = document.createElement('div');
  imageBlock.className = 'inventory-model-detail-image';
  if (model.imagen_url) {
    const image = document.createElement('img');
    image.src = model.imagen_url;
    image.alt = `Imagen de ${model.nombre_modelo}`;
    imageBlock.append(image);
  } else {
    const missing = document.createElement('span');
    missing.className = 'inventory-model-image-missing';
    missing.textContent = 'Sin imagen';
    imageBlock.append(missing);
  }
  const list = document.createElement('dl');
  list.className = 'inventory-model-details';
  [
    ['ID del modelo', model.id_modelo],
    ['Precio', model.precio == null ? 'Pendiente de asignar' : formatCurrencyPEN(model.precio)],
    ['Nombre del modelo', model.nombre_modelo],
    ['Presentación', model.presentacion || '—'],
    ['Nivel educativo', model.nivel_educativo || '—'],
    ['Diseño relacionado', model.nombre_diseno || '—'],
    ['Proveedor relacionado', model.nombre_proveedor || '—'],
    ['Categoría relacionada', model.nombre_categoria || '—'],
    ['Estado actual', Number(model.estado) === 1 ? 'Activo' : 'Inactivo'],
  ].forEach(([term, value]) => {
    const wrapper = document.createElement('div');
    const heading = document.createElement('dt');
    heading.textContent = term;
    const detail = document.createElement('dd');
    detail.textContent = String(value);
    wrapper.append(heading, detail);
    list.append(wrapper);
  });
  content.append(imageBlock, list);
  return content;
}

export function createModelsModule(root, { isActive, onChanged, modal }) {
  const categoryFilter = root.querySelector('#modelCategoryFilter');
  const providerFilter = root.querySelector('#modelProviderFilter');
  const designFilter = root.querySelector('#modelDesignFilter');
  const levelFilter = root.querySelector('#modelLevelFilter');
  const stateFilter = root.querySelector('#modelStateFilter');

  function cached(name) { return appState.catalogos.getStatus(name).data ?? []; }

  function syncFilters() {
    const categories = cached('categorias');
    const designs = cached('disenios');
    const models = cached('modelos');
    const categoryOptions = [['', 'Todas las categorías'], ...categories.map((item) => [item.id_categoria, `${item.nombre_categoria}${Number(item.estado) === 1 ? '' : ' (inactiva)'}`])];
    const dependentOptions = getDependentModelFilterOptions(designs, {
      categoryId: modelCategoryFilter,
      providerId: modelProviderFilter,
    });
    modelProviderFilter = dependentOptions.providerId;
    const providerOptions = [['', 'Todos los proveedores'], ...dependentOptions.providers.map(({ id, name }) => [id, name])];
    const designOptions = [['', 'Todos los diseños'], ...dependentOptions.designs.map((item) => [item.id_diseno, `${item.nombre_diseno}${Number(item.estado) === 1 ? '' : ' (inactivo)'}`])];
    const levels = [...new Set(models.map((item) => String(item.nivel_educativo ?? '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es-PE'));
    const levelOptions = [['', 'Todos los niveles'], ...levels.map((item) => [item, item])];
    const update = (select, options, selected) => {
      const current = [...select.options].map((option) => [option.value, option.textContent]);
      if (JSON.stringify(current) !== JSON.stringify(options.map(([value, label]) => [String(value), label]))) {
        select.replaceChildren(...options.map(([value, label]) => {
          const option = document.createElement('option'); option.value = String(value); option.textContent = label; return option;
        }));
      }
      select.value = options.some(([value]) => String(value) === selected) ? selected : '';
    };
    update(categoryFilter, categoryOptions, modelCategoryFilter);
    update(providerFilter, providerOptions, modelProviderFilter);
    update(designFilter, designOptions, modelDesignFilter);
    update(levelFilter, levelOptions, modelLevelFilter);
    modelCategoryFilter = categoryFilter.value;
    modelProviderFilter = providerFilter.value;
    modelDesignFilter = designFilter.value;
    modelLevelFilter = levelFilter.value;
  }

  async function ensureRelations() {
    try {
      await Promise.all([appState.catalogos.get('categorias'), appState.catalogos.get('disenios')]);
      if (isActive()) onChanged({ renderOnly: true });
    } catch (error) {
      showToast(error.message || 'No se pudieron cargar categorías y diseños.', 'error');
    }
  }

  async function refreshAfterMutation({ designCountChanged = false } = {}) {
    try {
      const reloads = [appState.catalogos.reload('modelos')];
      if (designCountChanged) reloads.push(appState.catalogos.reload('disenios'));
      await Promise.all(reloads);
      await onChanged();
      return true;
    } catch {
      await onChanged();
      return false;
    }
  }

  async function openModelForm(model = null) {
    let categories;
    let designs;
    try {
      [categories, designs] = await Promise.all([appState.catalogos.get('categorias'), appState.catalogos.get('disenios')]);
    } catch (error) {
      showToast(error.message || 'No se pudieron cargar las relaciones del modelo.', 'error');
      return;
    }

    const isEdit = Boolean(model);
    const currentDesign = isEdit ? designs.find((item) => String(item.id_diseno) === String(model.id_diseno)) : null;
    const currentCategory = currentDesign ? categories.find((item) => String(item.id_categoria) === String(currentDesign.id_categoria)) : null;
    const form = document.createElement('form');
    form.id = 'modelForm';
    form.className = 'form-stack';
    form.noValidate = true;
    const requestError = document.createElement('p');
    requestError.className = 'field-error'; requestError.setAttribute('role', 'alert'); requestError.hidden = true;

    const category = makeSelect('modelCategoryInput', 'id_categoria', 'Selecciona una categoría activa');
    categories.filter((item) => Number(item.estado) === 1).forEach((item) => appendOption(category, item.id_categoria, item.nombre_categoria));
    if (currentCategory && Number(currentCategory.estado) !== 1) appendOption(category, currentCategory.id_categoria, `${currentCategory.nombre_categoria} (inactiva; histórica)`, true);
    category.value = String(currentDesign?.id_categoria ?? '');

    const supplier = makeSelect('modelSupplierInput', 'id_proveedor', 'Selecciona una categoría primero');
    supplier.disabled = true;
    const design = makeSelect('modelDesignInput', 'id_diseno', 'Selecciona un diseño activo');
    design.disabled = true;
    let filteredDesigns = [];
    let providerRequest = 0;
    let designRequest = 0;
    const setDesignPlaceholder = (label) => {
      design.replaceChildren();
      appendOption(design, '', label, true);
    };
    const loadDesignOptions = async (idProveedor, preferredDesignId = '') => {
      const requestId = ++designRequest;
      filteredDesigns = [];
      setDesignPlaceholder(idProveedor ? 'Cargando diseños…' : 'Selecciona un proveedor primero');
      design.disabled = true;
      if (!category.value || !idProveedor) return;
      try {
        const query = new URLSearchParams({ id_categoria: category.value, id_proveedor: String(idProveedor) });
        const response = await http(`/api/disenios?${query}`);
        if (requestId !== designRequest) return;
        const rows = Array.isArray(response.data) ? response.data : [];
        filteredDesigns = rows.filter((item) => {
          const historical = isEdit && String(model.id_diseno) === String(item.id_diseno) &&
            String(currentDesign?.id_categoria) === String(category.value) &&
            String(currentDesign?.id_proveedor) === String(idProveedor);
          const active = Number(item.estado) === 1 && Number(item.estado_categoria) === 1 && item.estado_proveedor === 'Activo';
          return active || historical;
        });
        setDesignPlaceholder(filteredDesigns.length ? 'Selecciona un diseño' : 'No hay diseños; puedes crear uno aquí.');
        filteredDesigns.forEach((item) => {
          const active = Number(item.estado) === 1 && Number(item.estado_categoria) === 1 && item.estado_proveedor === 'Activo';
          appendOption(design, item.id_diseno, active ? item.nombre_diseno : `${item.nombre_diseno} (inactivo; relación histórica)`, !active);
        });
        if (filteredDesigns.some((item) => String(item.id_diseno) === String(preferredDesignId))) {
          design.value = String(preferredDesignId);
        }
        design.disabled = filteredDesigns.length === 0;
      } catch (error) {
        if (requestId !== designRequest) return;
        setDesignPlaceholder('No se pudieron cargar los diseños.');
        requestError.hidden = false;
        requestError.textContent = error.message || 'No se pudieron cargar los diseños de esta categoría y proveedor.';
        design.disabled = true;
      }
    };
    const loadProviderOptions = async (preferredProviderId = '', preferredDesignId = '') => {
      const requestId = ++providerRequest;
      designRequest += 1;
      filteredDesigns = [];
      supplier.replaceChildren();
      appendOption(supplier, '', category.value ? 'Cargando proveedores…' : 'Selecciona una categoría primero', true);
      supplier.disabled = true;
      setDesignPlaceholder('Selecciona un proveedor primero');
      design.disabled = true;
      if (!category.value) return;
      try {
        const response = await http('/api/proveedores');
        if (requestId !== providerRequest) return;
        const availableRows = Array.isArray(response.data) ? response.data : [];
        const rows = isEdit && currentCategory && Number(currentCategory.estado) !== 1
          ? availableRows.filter((item) => String(item.id_proveedor) === String(currentDesign?.id_proveedor))
          : availableRows;
        supplier.replaceChildren();
        appendOption(supplier, '', rows.length ? 'Selecciona un proveedor' : 'No hay proveedores activos.', true);
        rows.forEach((item) => appendOption(supplier, item.id_proveedor, item.razon_social));
        const currentHistoricalProvider = isEdit && currentDesign &&
          String(currentDesign.id_categoria) === String(category.value) &&
          !rows.some((item) => String(item.id_proveedor) === String(currentDesign.id_proveedor));
        if (currentHistoricalProvider) {
          appendOption(supplier, currentDesign.id_proveedor,
            `${currentDesign.nombre_proveedor} (inactivo; relación histórica)`, true);
        }
        supplier.disabled = rows.length === 0 && !currentHistoricalProvider;
        if (preferredProviderId && [...supplier.options].some((option) => option.value === String(preferredProviderId))) {
          supplier.value = String(preferredProviderId);
          await loadDesignOptions(supplier.value, preferredDesignId);
        }
      } catch (error) {
        if (requestId !== providerRequest) return;
        supplier.replaceChildren();
        appendOption(supplier, '', 'No se pudieron cargar los proveedores.', true);
        designRequest += 1;
        setDesignPlaceholder('Selecciona un proveedor primero');
        design.disabled = true;
        requestError.hidden = false;
        requestError.textContent = error.message || 'No se pudieron cargar los proveedores de esta categoría.';
      }
    };
    if (category.value) await loadProviderOptions(currentDesign?.id_proveedor ?? '', model?.id_diseno ?? '');

    const name = document.createElement('input');
    name.className = 'input-custom'; name.id = 'modelNameInput'; name.name = 'nombre_modelo'; name.type = 'text'; name.required = true; name.maxLength = 60; name.autocomplete = 'off'; name.value = model?.nombre_modelo ?? '';
    const level = makeSelect('modelLevelInput', 'nivel_educativo', 'Selecciona un nivel educativo');
    EDUCATION_LEVELS.forEach((value) => appendOption(level, value, value));
    level.value = EDUCATION_LEVELS.includes(model?.nivel_educativo) ? model.nivel_educativo : '';
    const categoryField = makeField('Categoría', category.id, category);
    const supplierField = makeField('Proveedor', supplier.id, supplier);
    const designField = makeField('Diseño', design.id, design);
    const createDesignButton = document.createElement('button');
    createDesignButton.type = 'button';
    createDesignButton.className = 'btn-cancel inventory-model-create-design-toggle';
    createDesignButton.dataset.requiresPermission = 'disenios.registrar';
    createDesignButton.textContent = '+ Crear diseño para este proveedor';
    createDesignButton.disabled = true;
    designField.append(createDesignButton);

    const createDesignPanel = document.createElement('div');
    createDesignPanel.className = 'inventory-model-create-design';
    createDesignPanel.hidden = true;
    const createDesignName = document.createElement('input');
    createDesignName.className = 'input-custom';
    createDesignName.id = 'modelNewDesignNameInput';
    createDesignName.type = 'text';
    createDesignName.maxLength = 30;
    createDesignName.autocomplete = 'off';
    createDesignName.placeholder = 'Ejemplo: Resinado';
    const createDesignNameField = makeField('Nombre del tipo o diseño (máximo 30 caracteres)', createDesignName.id, createDesignName);
    const createDesignError = document.createElement('span');
    createDesignError.className = 'field-error';
    createDesignError.setAttribute('role', 'alert');
    createDesignNameField.append(createDesignError);
    const createDesignHint = document.createElement('small');
    createDesignHint.className = 'inventory-model-note';
    createDesignHint.textContent = 'Quedará asociado a la categoría y al proveedor seleccionados.';
    const createDesignActions = document.createElement('div');
    createDesignActions.className = 'inventory-model-create-design-actions';
    const saveDesignButton = document.createElement('button');
    saveDesignButton.type = 'button';
    saveDesignButton.className = 'btn-primary-action';
    saveDesignButton.dataset.requiresPermission = 'disenios.registrar';
    saveDesignButton.textContent = 'Guardar diseño';
    const cancelDesignButton = document.createElement('button');
    cancelDesignButton.type = 'button';
    cancelDesignButton.className = 'btn-cancel';
    cancelDesignButton.textContent = 'Cancelar';
    createDesignActions.append(saveDesignButton, cancelDesignButton);
    createDesignPanel.append(createDesignNameField, createDesignHint, createDesignActions);

    const updateCreateDesignAvailability = () => {
      createDesignButton.disabled = !category.value || !supplier.value ||
        Boolean(category.selectedOptions[0]?.disabled || supplier.selectedOptions[0]?.disabled);
    };
    updateCreateDesignAvailability();
    createDesignButton.addEventListener('click', () => {
      createDesignError.textContent = '';
      createDesignPanel.hidden = false;
      createDesignName.focus();
    });
    cancelDesignButton.addEventListener('click', () => {
      createDesignName.value = '';
      createDesignError.textContent = '';
      createDesignPanel.hidden = true;
    });
    saveDesignButton.addEventListener('click', async () => {
      const designName = createDesignName.value.trim();
      createDesignError.textContent = '';
      if (!category.value || !supplier.value) {
        createDesignError.textContent = 'Selecciona primero la categoría y el proveedor.';
        return;
      }
      if (!designName) {
        createDesignError.textContent = 'Escribe el nombre del tipo o diseño.';
        createDesignName.focus();
        return;
      }
      if (Array.from(designName).length > 30) {
        createDesignError.textContent = 'El nombre del diseño admite hasta 30 caracteres.';
        createDesignName.focus();
        return;
      }
      const normalizeDesignName = (value) => String(value ?? '')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-PE').trim();
      const duplicate = designs.find((item) =>
        String(item.id_categoria) === String(category.value) &&
        String(item.id_proveedor) === String(supplier.value) &&
        normalizeDesignName(item.nombre_diseno) === normalizeDesignName(designName));
      if (duplicate) {
        createDesignError.textContent = Number(duplicate.estado) === 1
          ? 'Ese diseño ya existe para este proveedor; selecciónalo en la lista.'
          : 'Ese diseño ya existe, pero está inactivo. Actívalo desde la pestaña Diseños.';
        return;
      }

      saveDesignButton.disabled = true;
      createDesignPanel.setAttribute('aria-busy', 'true');
      try {
        const response = await http('/api/disenios', 'POST', {
          id_categoria: Number(category.value),
          id_proveedor: Number(supplier.value),
          nombre_diseno: designName,
        });
        const createdDesign = response.data;
        if (!createdDesign?.id_diseno) throw new Error('El servidor no devolvió el diseño creado.');
        try {
          designs = await appState.catalogos.reload('disenios');
          if (isActive()) onChanged({ renderOnly: true, refreshStats: true });
        } catch {
          designs.push(createdDesign);
          showToast('El diseño se guardó, pero no se pudo actualizar el contador del catálogo.', 'warning');
        }
        await loadDesignOptions(supplier.value, createdDesign.id_diseno);
        if (String(design.value) !== String(createdDesign.id_diseno)) {
          throw new Error('El diseño se guardó, pero no se pudo seleccionar. Vuelve a cargar los diseños e inténtalo de nuevo.');
        }
        createDesignName.value = '';
        createDesignPanel.hidden = true;
        showToast('Diseño guardado y listo para asociar al modelo.', 'success');
      } catch (error) {
        createDesignError.textContent = error.message || 'No se pudo guardar el diseño.';
      } finally {
        createDesignPanel.removeAttribute('aria-busy');
        saveDesignButton.disabled = false;
      }
    });

    const nameField = makeField('Nombre del modelo', name.id, name);
    const levelField = makeField('Nivel educativo', level.id, level);
    const price = document.createElement('input');
    price.className = 'input-custom'; price.id = 'modelPriceInput'; price.name = 'precio';
    price.type = 'number'; price.min = '0'; price.max = '99999999.99'; price.step = '0.01'; price.required = false;
    price.value = model?.precio ?? '';
    const priceField = makeField('Precio referencial (S/, opcional)', price.id, price);
    const presentation = document.createElement('textarea');
    presentation.className = 'input-custom'; presentation.id = 'modelPresentationInput'; presentation.name = 'presentacion';
    presentation.rows = 3; presentation.maxLength = 255; presentation.value = model?.presentacion ?? model?.descripcion ?? '';
    const presentationField = makeField('Presentación (opcional)', presentation.id, presentation);
    const imageInput = document.createElement('input');
    imageInput.className = 'input-custom'; imageInput.id = 'modelImageInput'; imageInput.name = 'imagen';
    imageInput.type = 'file'; imageInput.accept = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp';
    const imageField = makeField('Imagen principal (opcional)', imageInput.id, imageInput);
    const imagePreview = document.createElement('img');
    imagePreview.className = 'inventory-model-preview';
    imagePreview.alt = model?.nombre_modelo ? `Vista previa de ${model.nombre_modelo}` : 'Vista previa de la imagen seleccionada';
    imagePreview.hidden = true;
    const imageMissing = document.createElement('span');
    imageMissing.className = 'inventory-model-image-missing';
    imageMissing.textContent = 'Sin imagen';
    const imageError = document.createElement('span');
    imageError.className = 'field-error'; imageError.setAttribute('role', 'alert');
    const cancelImageSelection = document.createElement('button');
    cancelImageSelection.type = 'button'; cancelImageSelection.className = 'btn-cancel inventory-model-image-cancel';
    cancelImageSelection.textContent = 'Cancelar selección'; cancelImageSelection.hidden = true;
    let previewObjectUrl = null;
    const releasePreviewObjectUrl = () => {
      if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = null;
    };
    const showImage = (url) => {
      releasePreviewObjectUrl();
      if (url) {
        imagePreview.src = url; imagePreview.hidden = false; imageMissing.hidden = true;
      } else {
        imagePreview.removeAttribute('src'); imagePreview.hidden = true; imageMissing.hidden = false;
      }
    };
    showImage(model?.imagen_url ?? null);
    imageField.append(imagePreview, imageMissing, imageError, cancelImageSelection);
    imageInput.addEventListener('change', () => {
      const file = imageInput.files?.[0];
      imageError.textContent = '';
      const error = validateModelImageFile(file);
      if (error) {
        imageInput.value = ''; imageError.textContent = error; cancelImageSelection.hidden = true;
        showImage(model?.imagen_url ?? null); return;
      }
      if (file) {
        releasePreviewObjectUrl();
        previewObjectUrl = URL.createObjectURL(file);
        imagePreview.src = previewObjectUrl; imagePreview.hidden = false; imageMissing.hidden = true;
        cancelImageSelection.hidden = false;
      } else {
        showImage(model?.imagen_url ?? null); cancelImageSelection.hidden = true;
      }
    });
    cancelImageSelection.addEventListener('click', () => {
      imageInput.value = ''; imageError.textContent = ''; cancelImageSelection.hidden = true;
      showImage(model?.imagen_url ?? null);
    });
    const categoryError = document.createElement('span'); categoryError.className = 'field-error'; categoryError.setAttribute('role', 'alert');
    const supplierError = document.createElement('span'); supplierError.className = 'field-error'; supplierError.setAttribute('role', 'alert');
    const nameError = document.createElement('span'); nameError.className = 'field-error'; nameError.setAttribute('role', 'alert');
    const designError = document.createElement('span'); designError.className = 'field-error'; designError.setAttribute('role', 'alert');
    const levelError = document.createElement('span'); levelError.className = 'field-error'; levelError.setAttribute('role', 'alert');
    categoryField.append(categoryError); supplierField.append(supplierError); nameField.append(nameError); designField.append(designError); levelField.append(levelError);
    if (currentDesign && (Number(currentDesign.estado) !== 1 || Number(currentCategory?.estado) !== 1)) {
      const note = document.createElement('small'); note.className = 'inventory-model-note';
      note.textContent = 'La relación inactiva se conserva para este modelo histórico; selecciona relaciones activas para reasignarlo.';
      designField.append(note);
    }
    form.append(requestError, categoryField, supplierField, designField, createDesignPanel, nameField, levelField, priceField, presentationField, imageField);

    category.addEventListener('change', () => {
      supplier.value = ''; design.value = '';
      categoryError.textContent = ''; supplierError.textContent = ''; designError.textContent = ''; requestError.hidden = true;
      updateCreateDesignAvailability();
      void loadProviderOptions();
    });
    supplier.addEventListener('change', () => {
      design.value = ''; supplierError.textContent = ''; designError.textContent = ''; requestError.hidden = true;
      updateCreateDesignAvailability();
      void loadDesignOptions(supplier.value);
    });
    level.addEventListener('change', () => { levelError.textContent = ''; requestError.hidden = true; });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const modelName = name.value.trim();
      const designId = Number(design.value);
      categoryError.textContent = ''; supplierError.textContent = ''; nameError.textContent = ''; designError.textContent = ''; levelError.textContent = ''; requestError.hidden = true;
      const missing = validateRequiredFields({ id_categoria: category.value, id_proveedor: supplier.value, id_diseno: design.value, nombre_modelo: modelName, nivel_educativo: level.value });
      if (missing.includes('id_categoria')) { categoryError.textContent = 'Selecciona una categoría activa.'; category.focus(); return; }
      if (missing.includes('id_proveedor')) { supplierError.textContent = 'Selecciona un proveedor disponible para esta categoría.'; supplier.focus(); return; }
      if (missing.includes('id_diseno')) { designError.textContent = 'Selecciona un diseño activo.'; design.focus(); return; }
      if (missing.includes('nombre_modelo')) { nameError.textContent = 'El nombre del modelo es obligatorio.'; name.focus(); return; }
      if (missing.includes('nivel_educativo') || !EDUCATION_LEVELS.includes(level.value)) {
        levelError.textContent = 'Selecciona un nivel educativo válido.'; level.focus(); return;
      }
      if (Array.from(modelName).length > 60) {
        requestError.hidden = false; requestError.textContent = 'El nombre del modelo admite hasta 60 caracteres.'; return;
      }
      if (price.value.trim() && !/^\d{1,8}(\.\d{1,2})?$/.test(price.value)) {
        requestError.hidden = false; requestError.textContent = 'Ingresa un precio entre 0 y 99999999.99 con hasta dos decimales, o déjalo pendiente.'; price.focus(); return;
      }
      if (Array.from(presentation.value).length > 255) {
        requestError.hidden = false; requestError.textContent = 'La presentación admite hasta 255 caracteres.'; presentation.focus(); return;
      }
      const imageFile = imageInput.files?.[0] ?? null;
      const imageValidationError = validateModelImageFile(imageFile);
      if (imageValidationError) {
        imageError.textContent = imageValidationError; imageInput.focus(); return;
      }
      const selectedDesign = filteredDesigns.find((item) => String(item.id_diseno) === String(designId));
      const isHistoricalDesign = isEdit && String(model.id_diseno) === String(designId) &&
        Number(currentDesign?.id_categoria) === Number(category.value) && Number(currentDesign?.id_proveedor) === Number(supplier.value);
      const activeAssignment = selectedDesign && Number(selectedDesign.estado) === 1 &&
        Number(selectedDesign.estado_categoria) === 1 && selectedDesign.estado_proveedor === 'Activo';
      if (!selectedDesign || Number(selectedDesign.id_categoria) !== Number(category.value) ||
          Number(selectedDesign.id_proveedor) !== Number(supplier.value) || (!activeAssignment && !isHistoricalDesign)) {
        designError.textContent = 'El diseño debe pertenecer a la categoría y al proveedor seleccionados.'; design.focus(); return;
      }
      const submit = root.querySelector('#inventoryModalFooter [type="submit"]');
      submit.disabled = true; form.setAttribute('aria-busy', 'true');
      try {
        const body = new FormData();
        body.append('id_categoria', category.value);
        body.append('id_proveedor', supplier.value);
        body.append('id_diseno', String(designId));
        body.append('nombre_modelo', modelName);
        body.append('nivel_educativo', level.value);
        body.append('precio', price.value);
        body.append('presentacion', presentation.value.trim());
        if (imageFile) body.append('imagen', imageFile);
        const response = await http(isEdit ? `/api/modelos/${encodeURIComponent(model.id_modelo)}` : '/api/modelos', isEdit ? 'PUT' : 'POST', body);
        modal.close();
        releasePreviewObjectUrl();
        showToast(response.message || (isEdit ? 'Modelo actualizado correctamente.' : 'Modelo creado correctamente.'), 'success');
        const relationChanged = isEdit && String(model.id_diseno) !== String(designId);
        if (!await refreshAfterMutation({
          designCountChanged: !isEdit || relationChanged,
        })) {
          showToast('El cambio se guardó, pero no se pudieron actualizar todos los catálogos. Intenta recargarlos.', 'warning');
        }
      } catch (error) {
        requestError.hidden = false; requestError.textContent = error.message || 'No se pudo guardar el modelo.';
        showToast(error.message || 'No se pudo guardar el modelo.', 'error');
      } finally {
        form.removeAttribute('aria-busy'); if (submit.isConnected) submit.disabled = false;
      }
    });

    const saveModelButton = document.createElement('button');
    Object.assign(saveModelButton, { type: 'submit', className: 'btn-primary-action', textContent: isEdit ? 'Guardar cambios' : 'Guardar modelo' });
    saveModelButton.dataset.requiresPermission = isEdit ? 'modelos.editar' : 'modelos.registrar';
    modal.open(isEdit ? 'Editar modelo' : 'Nuevo modelo', 'El nombre admite hasta 60 caracteres.', form, [
      modal.createButton('Cancelar', 'btn-cancel', () => { releasePreviewObjectUrl(); modal.close(); }),
      saveModelButton,
    ]);
    const submit = root.querySelector('#inventoryModalFooter [type="submit"]'); submit.setAttribute('form', form.id);
  }

  async function changeState(model, state, button = null) {
    if (button?.disabled) return;
    if (button) button.disabled = true;
    try {
      const response = await http(`/api/modelos/${encodeURIComponent(model.id_modelo)}/estado`, 'PATCH', { estado: state });
      if (state === 0) modal.close();
      showToast(response.message || (state ? 'Modelo activado correctamente.' : 'Modelo desactivado correctamente.'), 'success');
      if (!await refreshAfterMutation()) showToast('El estado se guardó, pero no se pudo actualizar el listado.', 'warning');
    } catch (error) {
      const detail = root.querySelector('#modelModalError');
      if (detail) { detail.hidden = false; detail.textContent = error.message; }
      showToast(error.message || 'No se pudo cambiar el estado del modelo.', 'error');
    } finally { if (button?.isConnected) button.disabled = false; }
  }

  function confirmDeactivation(model) {
    const content = document.createElement('div');
    const message = document.createElement('p'); message.className = 'category-confirm-message';
    message.append(document.createTextNode('¿Deseas desactivar el modelo '));
    const name = document.createElement('strong'); name.textContent = model.nombre_modelo;
    message.append(name, document.createTextNode('? No se eliminará el registro ni sus relaciones.'));
    const error = document.createElement('p'); error.className = 'field-error'; error.id = 'modelModalError'; error.setAttribute('role', 'alert'); error.hidden = true;
    content.append(message, error);
    const deactivate = modal.createButton('Desactivar', 'btn-danger-action', () => { void changeState(model, 0, deactivate); });
    deactivate.dataset.requiresPermission = 'modelos.cambiar_estado';
    modal.open('Confirmar desactivación', 'El modelo dejará de estar activo en el catálogo.', content, [
      modal.createButton('Cancelar', 'btn-cancel', () => modal.close()),
      deactivate,
    ]);
  }

  function handleAction(action, id, button) {
    const model = cached('modelos').find((item) => String(item.id_modelo) === String(id));
    if (!model) { showToast('El modelo ya no está disponible. Actualiza el listado.', 'warning'); return; }
    if (action === 'view') {
      modal.open(`Modelo #${model.id_modelo}`, 'Detalle informativo del modelo.', renderDetails(model), [modal.createButton('Cerrar', 'btn-cancel', () => modal.close())]);
    } else if (action === 'edit') void openModelForm(model);
    else if (Number(model.estado) === 1) confirmDeactivation(model);
    else void changeState(model, 1, button);
  }

  root.querySelector('#modelCreateButton').addEventListener('click', () => { void openModelForm(); });
  categoryFilter.addEventListener('change', () => {
    modelCategoryFilter = categoryFilter.value;
    modelProviderFilter = '';
    modelDesignFilter = '';
    if (isActive()) onChanged({ renderOnly: true });
  });
  providerFilter.addEventListener('change', () => {
    modelProviderFilter = providerFilter.value;
    modelDesignFilter = '';
    if (isActive()) onChanged({ renderOnly: true });
  });
  designFilter.addEventListener('change', () => { modelDesignFilter = designFilter.value; if (isActive()) onChanged({ renderOnly: true }); });
  levelFilter.addEventListener('change', () => { modelLevelFilter = levelFilter.value; if (isActive()) onChanged({ renderOnly: true }); });
  stateFilter.addEventListener('change', () => { modelStateFilter = stateFilter.value; if (isActive()) onChanged({ renderOnly: true }); });

  return {
    setVisible(visible) {
      [categoryFilter, providerFilter, designFilter, levelFilter, stateFilter].forEach((select) => { select.hidden = !visible; select.disabled = !visible; });
      root.querySelector('#modelCreateButton').hidden = !visible;
      if (visible) void ensureRelations();
      syncFilters();
    },
    getSearch() { return modelSearch; },
    setSearch(value) { modelSearch = value; },
    handleAction,
    render() {
      syncFilters();
      return renderModels(filterModels(cached('modelos'), {
        search: modelSearch, categoryId: modelCategoryFilter, providerId: modelProviderFilter, designId: modelDesignFilter,
        level: modelLevelFilter, state: modelStateFilter,
      }));
    },
  };
}
