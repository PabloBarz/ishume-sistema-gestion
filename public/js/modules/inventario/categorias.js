import { appState } from '../../appState.js';
import { closeOverlay, http, openOverlay, showToast } from '../../utils.js';
import { createActionButton, createCell, createStatusCell, createTable } from '../../components/inventoryTable.js';

let categorySearch = '';
let categoryStateFilter = '';

export function filterCategories(categories, search = '', state = '') {
  const normalizedSearch = search.trim().toLocaleLowerCase('es-PE');
  return categories.filter((category) => {
    const matchesName = String(category.nombre_categoria ?? '').toLocaleLowerCase('es-PE').includes(normalizedSearch);
    const matchesState = state === '' || String(category.estado) === state;
    return matchesName && matchesState;
  });
}

function renderCategoryTable(categories) {
  const rows = categories.map((category) => {
    const active = Number(category.estado) === 1;
    const actions = document.createElement('td');
    actions.className = 'inventory-category-actions';
    actions.append(
      createActionButton({ action: 'view', id: category.id_categoria, label: 'Consultar categoría', icon: 'bi bi-eye', className: 'btn-action-view' }),
      createActionButton({ action: 'edit', id: category.id_categoria, label: 'Editar categoría', icon: 'bi bi-pencil-square', className: 'btn-action-edit' }),
      createActionButton({
        action: 'toggle', id: category.id_categoria,
        label: active ? 'Desactivar categoría' : 'Activar categoría',
        icon: active ? 'bi bi-toggle-on' : 'bi bi-toggle-off',
        className: active ? 'inventory-state-off' : 'inventory-state-on',
      }),
    );
    return [createCell(category.id_categoria), createCell(category.nombre_categoria), createStatusCell(category.estado), actions];
  });
  return createTable(['ID', 'Categoría', 'Estado', 'Acciones'], rows);
}

export function createCategoriesModule(root, { isActive, onChanged }) {
  const modal = root.querySelector('#inventoryModal');
  const modalTitle = root.querySelector('#inventoryModalTitle');
  const modalSubtitle = root.querySelector('#inventoryModalSubtitle');
  const modalBody = root.querySelector('#inventoryModalBody');
  const modalFooter = root.querySelector('#inventoryModalFooter');

  function closeCategoryModal() {
    closeOverlay('inventoryModal');
  }

  function openCategoryModal(title, subtitle, body, footer) {
    modalTitle.textContent = title;
    modalSubtitle.textContent = subtitle;
    modalBody.replaceChildren(body);
    modalFooter.replaceChildren(...footer);
    openOverlay('inventoryModal');
  }

  function createModalButton(label, className, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    button.addEventListener('click', onClick);
    return button;
  }

  async function refreshCategories(nameChanged = false) {
    if (nameChanged) {
      ['disenios', 'modelos', 'productos'].forEach((catalog) => appState.catalogos.invalidate(catalog));
    }
    try {
      await appState.catalogos.reload('categorias');
      await onChanged({ nameChanged });
      return true;
    } catch {
      await onChanged({ nameChanged });
      return false;
    }
  }

  function openCategoryForm(category = null) {
    const isEdit = Boolean(category);
    const form = document.createElement('form');
    form.id = 'categoryForm';
    form.className = 'form-stack';
    form.noValidate = true;

    const field = document.createElement('div');
    const label = document.createElement('label');
    label.className = 'form-label-custom';
    label.htmlFor = 'categoryNameInput';
    label.textContent = 'Nombre de la categoría';
    const input = document.createElement('input');
    input.className = 'input-custom';
    input.id = 'categoryNameInput';
    input.name = 'nombre_categoria';
    input.type = 'text';
    input.autocomplete = 'off';
    input.required = true;
    input.setAttribute('aria-describedby', 'categoryNameError categoryNameCounter');
    input.value = category?.nombre_categoria ?? '';
    const error = document.createElement('span');
    error.className = 'field-error';
    error.id = 'categoryNameError';
    error.setAttribute('role', 'alert');
    const counter = document.createElement('div');
    counter.className = 'char-counter';
    counter.id = 'categoryNameCounter';

    const updateCounter = () => {
      counter.textContent = `${Array.from(input.value.trim()).length}/30 caracteres`;
    };
    input.addEventListener('input', () => {
      input.classList.remove('is-invalid');
      input.removeAttribute('aria-invalid');
      error.textContent = '';
      updateCounter();
    });
    updateCounter();
    field.append(label, input, error, counter);
    form.append(field);

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const name = input.value.trim();
      error.textContent = '';
      input.classList.remove('is-invalid');
      input.removeAttribute('aria-invalid');
      if (!name) {
        input.classList.add('is-invalid');
        input.setAttribute('aria-invalid', 'true');
        error.textContent = 'El nombre de la categoría es obligatorio.';
        input.focus();
        return;
      }
      if (Array.from(name).length > 30) {
        input.classList.add('is-invalid');
        input.setAttribute('aria-invalid', 'true');
        error.textContent = 'El nombre no debe superar los 30 caracteres.';
        input.focus();
        return;
      }

      const submit = modalFooter.querySelector('[type="submit"]');
      submit.disabled = true;
      form.setAttribute('aria-busy', 'true');
      try {
        const url = isEdit ? `/api/categorias/${encodeURIComponent(category.id_categoria)}` : '/api/categorias';
        const response = await http(url, isEdit ? 'PUT' : 'POST', { nombre_categoria: name });
        closeCategoryModal();
        showToast(response.message || (isEdit ? 'Categoría actualizada correctamente.' : 'Categoría creada correctamente.'), 'success');
        if (!await refreshCategories(isEdit)) showToast('El cambio se guardó, pero no se pudo actualizar el listado. Intenta recargarlo.', 'warning');
      } catch (requestError) {
        if (requestError.status === 409) {
          input.classList.add('is-invalid');
          input.setAttribute('aria-invalid', 'true');
          error.textContent = requestError.message;
          input.focus();
        }
        showToast(requestError.message || 'No se pudo guardar la categoría.', 'error');
      } finally {
        form.removeAttribute('aria-busy');
        if (submit.isConnected) submit.disabled = false;
      }
    });

    const cancel = createModalButton('Cancelar', 'btn-cancel', closeCategoryModal);
    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'btn-primary-action';
    submit.setAttribute('form', form.id);
    submit.textContent = isEdit ? 'Guardar cambios' : 'Guardar categoría';
    openCategoryModal(isEdit ? 'Editar categoría' : 'Nueva categoría', 'El nombre debe ser único y tener hasta 30 caracteres.', form, [cancel, submit]);
    input.focus();
  }

  async function showCategoryDetails(id) {
    try {
      const { data } = await http(`/api/categorias/${encodeURIComponent(id)}`);
      const details = document.createElement('dl');
      details.className = 'detail-list category-detail-list';
      [['Identificador', data.id_categoria], ['Nombre', data.nombre_categoria], ['Estado', Number(data.estado) === 1 ? 'Activa' : 'Inactiva']]
        .forEach(([labelText, value]) => {
          const group = document.createElement('div');
          const label = document.createElement('dt');
          label.className = 'text-muted';
          label.textContent = labelText;
          const detail = document.createElement('dd');
          detail.textContent = String(value ?? '—');
          group.append(label, detail);
          details.append(group);
        });
      openCategoryModal('Detalle de categoría', `Registro #${data.id_categoria}`, details, [createModalButton('Cerrar', 'btn-cancel', closeCategoryModal)]);
    } catch (error) {
      showToast(error.message || 'No se pudo consultar la categoría.', 'error');
    }
  }

  async function changeCategoryState(category, state, actionButton = null) {
    if (actionButton?.disabled) return;
    if (actionButton) actionButton.disabled = true;
    try {
      const response = await http(`/api/categorias/${encodeURIComponent(category.id_categoria)}/estado`, 'PATCH', { estado: state });
      closeCategoryModal();
      showToast(response.message || (state === 1 ? 'Categoría activada correctamente.' : 'Categoría desactivada correctamente.'), 'success');
      if (!await refreshCategories()) showToast('El cambio se guardó, pero no se pudo actualizar el listado. Intenta recargarlo.', 'warning');
    } catch (error) {
      const modalError = modalBody.querySelector('#categoryModalError');
      if (modalError) {
        modalError.hidden = false;
        modalError.textContent = error.message;
      }
      showToast(error.message || 'No se pudo cambiar el estado de la categoría.', 'error');
    } finally {
      if (actionButton?.isConnected) actionButton.disabled = false;
    }
  }

  function confirmCategoryDeactivation(category) {
    const content = document.createElement('div');
    const message = document.createElement('p');
    message.className = 'category-confirm-message';
    message.append(document.createTextNode('¿Deseas desactivar la categoría '));
    const name = document.createElement('strong');
    name.textContent = category.nombre_categoria;
    message.append(name, document.createTextNode('? No se eliminará el registro ni su historial.'));
    const error = document.createElement('p');
    error.className = 'field-error';
    error.id = 'categoryModalError';
    error.setAttribute('role', 'alert');
    error.hidden = true;
    content.append(message, error);
    const cancel = createModalButton('Cancelar', 'btn-cancel', closeCategoryModal);
    const deactivate = createModalButton('Desactivar', 'btn-danger-action', () => changeCategoryState(category, 0, deactivate));
    openCategoryModal('Confirmar desactivación', 'La categoría no estará disponible para nuevas asignaciones.', content, [cancel, deactivate]);
  }

  function handleCategoryAction(action, id, actionButton) {
    const categories = appState.catalogos.getStatus('categorias').data ?? [];
    const category = categories.find((item) => String(item.id_categoria) === String(id));
    if (!category) {
      showToast('La categoría ya no está disponible. Actualiza el listado.', 'warning');
      return;
    }
    if (action === 'view') void showCategoryDetails(id);
    else if (action === 'edit') openCategoryForm(category);
    else if (action === 'toggle' && Number(category.estado) === 1) confirmCategoryDeactivation(category);
    else if (action === 'toggle') void changeCategoryState(category, 1, actionButton);
  }

  const search = root.querySelector('#inventory-search');
  const stateFilter = root.querySelector('#categoryStateFilter');
  root.querySelector('#inventoryModalClose').addEventListener('click', closeCategoryModal);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeCategoryModal();
  });
  root.querySelector('#categoryCreateButton').addEventListener('click', () => openCategoryForm());
  search.addEventListener('input', (event) => {
    categorySearch = event.target.value;
    if (isActive()) onChanged({ renderOnly: true });
  });
  stateFilter.addEventListener('change', (event) => {
    categoryStateFilter = event.target.value;
    if (isActive()) onChanged({ renderOnly: true });
  });
  root.querySelector('#inventory-panel').addEventListener('click', (event) => {
    const button = event.target.closest('[data-category-action]');
    if (button) handleCategoryAction(button.dataset.categoryAction, button.dataset.categoryId, button);
  });

  return {
    setVisible(visible) {
      search.disabled = !visible;
      search.placeholder = visible ? 'Buscar por nombre de categoría…' : 'Búsqueda disponible en una próxima fase';
      search.value = visible ? categorySearch : '';
      stateFilter.hidden = !visible;
      stateFilter.disabled = !visible;
      stateFilter.value = categoryStateFilter;
      root.querySelector('#inventory-filter-placeholder').hidden = visible;
      root.querySelector('#categoryCreateButton').hidden = !visible;
    },
    render() {
      const { data = [] } = appState.catalogos.getStatus('categorias');
      return renderCategoryTable(filterCategories(data, categorySearch, categoryStateFilter));
    },
  };
}
