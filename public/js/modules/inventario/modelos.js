import { appState } from '../../appState.js';
import { http, showToast, validateRequiredFields } from '../../utils.js';
import { createActionButton, createCell, createStatusCell, createTable } from '../../components/inventoryTable.js';

let modelSearch = '';
let modelCategoryFilter = '';
let modelDesignFilter = '';
let modelLevelFilter = '';
let modelStateFilter = '';
const EDUCATION_LEVELS = ['INICIAL', 'SUPERIOR'];

export function filterModels(models, { search = '', categoryId = '', designId = '', level = '', state = '' } = {}) {
  const query = search.trim().toLocaleLowerCase('es-PE');
  return models.filter((model) =>
    String(model.nombre_modelo ?? '').toLocaleLowerCase('es-PE').includes(query) &&
    (categoryId === '' || String(model.id_categoria) === categoryId) &&
    (designId === '' || String(model.id_diseno) === designId) &&
    (level === '' || String(model.nivel_educativo ?? '') === level) &&
    (state === '' || String(model.estado) === state));
}

function renderModels(models) {
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
      createCell(model.nombre_modelo, `ID: ${model.id_modelo}`),
      createCell(model.nivel_educativo || '—'),
      createStatusCell(model.estado),
      actions,
    ];
  });
  return createTable(['Modelo', 'Nivel educativo', 'Estado', 'Acciones'], rows, { className: 'inventory-model-table' });
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
  const list = document.createElement('dl');
  list.className = 'inventory-model-details';
  [
    ['ID del modelo', model.id_modelo],
    ['Nombre del modelo', model.nombre_modelo],
    ['Nivel educativo', model.nivel_educativo || '—'],
    ['Diseño relacionado', model.nombre_diseno || '—'],
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
  return list;
}

export function createModelsModule(root, { isActive, onChanged, modal }) {
  const categoryFilter = root.querySelector('#modelCategoryFilter');
  const designFilter = root.querySelector('#modelDesignFilter');
  const levelFilter = root.querySelector('#modelLevelFilter');
  const stateFilter = root.querySelector('#modelStateFilter');

  function cached(name) { return appState.catalogos.getStatus(name).data ?? []; }

  function syncFilters() {
    const categories = cached('categorias');
    const designs = cached('disenios');
    const models = cached('modelos');
    const categoryOptions = [['', 'Todas las categorías'], ...categories.map((item) => [item.id_categoria, `${item.nombre_categoria}${Number(item.estado) === 1 ? '' : ' (inactiva)'}`])];
    const eligibleDesigns = designs.filter((item) => modelCategoryFilter === '' || String(item.id_categoria) === modelCategoryFilter);
    const designOptions = [['', 'Todos los diseños'], ...eligibleDesigns.map((item) => [item.id_diseno, `${item.nombre_diseno}${Number(item.estado) === 1 ? '' : ' (inactivo)'}`])];
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
    update(designFilter, designOptions, modelDesignFilter);
    update(levelFilter, levelOptions, modelLevelFilter);
    modelCategoryFilter = categoryFilter.value;
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

  async function refreshAfterMutation({ designCountChanged = false, productsChanged = false } = {}) {
    try {
      const reloads = [appState.catalogos.reload('modelos')];
      if (designCountChanged) reloads.push(appState.catalogos.reload('disenios'));
      if (productsChanged) reloads.push(appState.catalogos.reload('productos'));
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

    const design = makeSelect('modelDesignInput', 'id_diseno', 'Selecciona un diseño activo');
    const updateDesignOptions = () => {
      const selectedCategory = category.value;
      const currentHistorical = isEdit && String(model.id_diseno) === String(design.value) && currentDesign && Number(currentDesign.estado) !== 1;
      design.replaceChildren();
      appendOption(design, '', 'Selecciona un diseño activo', true);
      designs.filter((item) => String(item.id_categoria) === selectedCategory && Number(item.estado) === 1 && Number(item.estado_categoria ?? 1) === 1)
        .forEach((item) => appendOption(design, item.id_diseno, item.nombre_diseno));
      if (currentDesign && String(currentDesign.id_categoria) === selectedCategory && (Number(currentDesign.estado) !== 1 || Number(currentCategory?.estado) !== 1)) {
        appendOption(design, currentDesign.id_diseno, `${currentDesign.nombre_diseno} (inactivo; relación histórica)`, true);
      }
      if (currentHistorical || (isEdit && String(model.id_diseno) === String(currentDesign?.id_diseno) && selectedCategory === String(currentDesign?.id_categoria))) design.value = String(model.id_diseno);
    };
    updateDesignOptions();

    const name = document.createElement('input');
    name.className = 'input-custom'; name.id = 'modelNameInput'; name.name = 'nombre_modelo'; name.type = 'text'; name.required = true; name.maxLength = 30; name.autocomplete = 'off'; name.value = model?.nombre_modelo ?? '';
    const level = makeSelect('modelLevelInput', 'nivel_educativo', 'Selecciona un nivel educativo');
    EDUCATION_LEVELS.forEach((value) => appendOption(level, value, value));
    level.value = EDUCATION_LEVELS.includes(model?.nivel_educativo) ? model.nivel_educativo : '';
    const categoryField = makeField('Categoría', category.id, category);
    const designField = makeField('Diseño', design.id, design);
    const nameField = makeField('Nombre del modelo', name.id, name);
    const levelField = makeField('Nivel educativo', level.id, level);
    const categoryError = document.createElement('span'); categoryError.className = 'field-error'; categoryError.setAttribute('role', 'alert');
    const nameError = document.createElement('span'); nameError.className = 'field-error'; nameError.setAttribute('role', 'alert');
    const designError = document.createElement('span'); designError.className = 'field-error'; designError.setAttribute('role', 'alert');
    const levelError = document.createElement('span'); levelError.className = 'field-error'; levelError.setAttribute('role', 'alert');
    categoryField.append(categoryError); nameField.append(nameError); designField.append(designError); levelField.append(levelError);
    if (currentDesign && (Number(currentDesign.estado) !== 1 || Number(currentCategory?.estado) !== 1)) {
      const note = document.createElement('small'); note.className = 'inventory-model-note';
      note.textContent = 'La relación inactiva se conserva para este modelo histórico; selecciona relaciones activas para reasignarlo.';
      designField.append(note);
    }
    form.append(requestError, categoryField, designField, nameField, levelField);

    category.addEventListener('change', () => {
      updateDesignOptions(); categoryError.textContent = ''; designError.textContent = ''; requestError.hidden = true;
    });
    level.addEventListener('change', () => { levelError.textContent = ''; requestError.hidden = true; });
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const modelName = name.value.trim();
      const designId = Number(design.value);
      categoryError.textContent = ''; nameError.textContent = ''; designError.textContent = ''; levelError.textContent = ''; requestError.hidden = true;
      const missing = validateRequiredFields({ id_categoria: category.value, id_diseno: design.value, nombre_modelo: modelName, nivel_educativo: level.value });
      if (missing.includes('id_categoria')) { categoryError.textContent = 'Selecciona una categoría activa.'; category.focus(); return; }
      if (missing.includes('id_diseno')) { designError.textContent = 'Selecciona un diseño activo.'; design.focus(); return; }
      if (missing.includes('nombre_modelo')) { nameError.textContent = 'El nombre del modelo es obligatorio.'; name.focus(); return; }
      if (missing.includes('nivel_educativo') || !EDUCATION_LEVELS.includes(level.value)) {
        levelError.textContent = 'Selecciona INICIAL o SUPERIOR.'; level.focus(); return;
      }
      if (Array.from(modelName).length > 30) {
        requestError.hidden = false; requestError.textContent = 'El nombre del modelo admite hasta 30 caracteres.'; return;
      }
      const selectedDesign = designs.find((item) => String(item.id_diseno) === String(designId));
      const isHistoricalDesign = isEdit && String(model.id_diseno) === String(designId) && currentDesign && Number(currentDesign.id_categoria) === Number(selectedDesign?.id_categoria);
      if (!selectedDesign || (!isHistoricalDesign && (Number(selectedDesign.estado) !== 1 || Number(selectedDesign.estado_categoria ?? 1) !== 1)) || (!isHistoricalDesign && Number(category.value) !== Number(selectedDesign.id_categoria))) {
        designError.textContent = 'Selecciona un diseño activo de la categoría indicada.'; design.focus(); return;
      }
      const submit = root.querySelector('#inventoryModalFooter [type="submit"]');
      submit.disabled = true; form.setAttribute('aria-busy', 'true');
      try {
        const response = await http(isEdit ? `/api/modelos/${encodeURIComponent(model.id_modelo)}` : '/api/modelos', isEdit ? 'PUT' : 'POST', {
          id_diseno: designId, nombre_modelo: modelName, nivel_educativo: level.value,
        });
        modal.close();
        showToast(response.message || (isEdit ? 'Modelo actualizado correctamente.' : 'Modelo creado correctamente.'), 'success');
        const relationChanged = isEdit && String(model.id_diseno) !== String(designId);
        const productDetailsChanged = isEdit && (
          relationChanged || model.nombre_modelo !== modelName || (model.nivel_educativo ?? '') !== level.value
        );
        if (!await refreshAfterMutation({
          designCountChanged: !isEdit || relationChanged,
          productsChanged: productDetailsChanged,
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

    modal.open(isEdit ? 'Editar modelo' : 'Nuevo modelo', 'El nombre admite hasta 30 caracteres.', form, [
      modal.createButton('Cancelar', 'btn-cancel', () => modal.close()),
      Object.assign(document.createElement('button'), { type: 'submit', className: 'btn-primary-action', textContent: isEdit ? 'Guardar cambios' : 'Guardar modelo' }),
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
    modal.open('Confirmar desactivación', 'No se podrá desactivar mientras tenga productos activos asociados.', content, [
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
    if (modelDesignFilter && !cached('disenios').some((item) => String(item.id_diseno) === modelDesignFilter && (modelCategoryFilter === '' || String(item.id_categoria) === modelCategoryFilter))) modelDesignFilter = '';
    if (isActive()) onChanged({ renderOnly: true });
  });
  designFilter.addEventListener('change', () => { modelDesignFilter = designFilter.value; if (isActive()) onChanged({ renderOnly: true }); });
  levelFilter.addEventListener('change', () => { modelLevelFilter = levelFilter.value; if (isActive()) onChanged({ renderOnly: true }); });
  stateFilter.addEventListener('change', () => { modelStateFilter = stateFilter.value; if (isActive()) onChanged({ renderOnly: true }); });

  return {
    setVisible(visible) {
      [categoryFilter, designFilter, levelFilter, stateFilter].forEach((select) => { select.hidden = !visible; select.disabled = !visible; });
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
        search: modelSearch, categoryId: modelCategoryFilter, designId: modelDesignFilter,
        level: modelLevelFilter, state: modelStateFilter,
      }));
    },
  };
}
