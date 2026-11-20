import { appState } from '../appState.js';
import { clearAuthContext } from '../auth.js';
import { clearErrors, closeOverlay, formatDate, http, openOverlay, setError, showToast } from '../utils.js';
import { createInventoryModal } from '../components/inventoryModal.js';

const MODULE_NAMES = {
  dashboard: 'Panel', inventario: 'Inventario', categorias: 'Categorías', disenios: 'Diseños',
  modelos: 'Modelos', proveedores: 'Proveedores', compras: 'Compras', colegios: 'Colegios',
  contratos: 'Contratos', pagos: 'Pagos', seguimiento_entrega: 'Seguimiento de entrega',
  usuarios: 'Usuarios', roles: 'Roles', permisos: 'Permisos',
};
const ACTION_NAMES = {
  consultar: 'Consultar', registrar: 'Registrar', editar: 'Editar', eliminar: 'Eliminar',
  cambiar_estado: 'Cambiar estado', revisar: 'Revisar', confirmar: 'Confirmar',
  registrar_documento: 'Registrar documento', registrar_abono: 'Registrar abono',
  corregir_abono: 'Corregir abono', desactivar: 'Desactivar', gestionar_permisos: 'Gestionar permisos',
  gestionar: 'Gestionar',
};

export async function init() {
  const root = document.getElementById('usersAdmin');
  if (!root || appState.auth.user?.rol !== 'administrador') return;

  const deactivationModal = createInventoryModal(root);
  const editor = document.getElementById('userEditorModal');
  const passwordModal = document.getElementById('userPasswordModal');
  const editorForm = document.getElementById('userEditorForm');
  const passwordForm = document.getElementById('userPasswordForm');
  const editorMessage = document.getElementById('userEditorMessage');
  const passwordMessage = document.getElementById('userPasswordMessage');
  const permissionList = document.getElementById('userPermissionsList');
  const roleSelect = document.getElementById('userRoleSelect');
  const listBody = document.getElementById('usersTableBody');
  const listStatus = document.getElementById('usersTableStatus');
  const createPasswordFields = document.getElementById('userCreatePasswordFields');
  const roleFilter = document.getElementById('usersRoleFilter');
  const search = document.getElementById('usersSearch');
  const statusFilter = document.getElementById('usersStatusFilter');
  const editorSave = document.getElementById('userEditorSave');
  const passwordSave = document.getElementById('userPasswordSave');

  let catalogs;
  let permissionDraft = new Map();
  let editingUser = null;
  let passwordUser = null;
  let searchTimer;
  let loading = false;
  let usersById = new Map();

  function closeModal(modal) {
    closeOverlay(modal.id);
    modal.hidden = true;
  }

  function openModal(modal) {
    modal.hidden = false;
    openOverlay(modal.id);
  }

  function showMessage(element, message) {
    element.textContent = message;
    element.hidden = !message;
  }

  function clearFieldError(input) {
    if (!input?.id) return;
    clearErrors([input.id]);
    const error = document.getElementById(`err-${input.id}`);
    if (error) error.hidden = true;
  }

  function clearFormValidation(form) {
    const fields = [...form.querySelectorAll('input[id], select[id]')];
    fields.forEach(clearFieldError);
  }

  function markFieldError(input, message) {
    setError(input.id, `err-${input.id}`, message);
    const error = document.getElementById(`err-${input.id}`);
    if (error) error.hidden = false;
    return input;
  }

  function validateForm(form, { requirePasswords = false } = {}) {
    clearFormValidation(form);
    let firstInvalid = null;
    const invalidate = (input, message) => {
      firstInvalid ||= markFieldError(input, message);
    };

    form.querySelectorAll('[required]').forEach((input) => {
      if (input.closest('[hidden]')) return;
      const empty = input.type === 'password' ? input.value.length === 0 : !input.value.trim();
      if (empty) {
        const label = input.closest('label')?.childNodes[0]?.textContent?.trim() || 'Este campo';
        invalidate(input, `${label} es obligatorio.`);
      }
    });

    const email = form.elements.correo;
    if (email?.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) {
      invalidate(email, 'Ingresa un correo válido.');
    }

    const documentType = form.elements.tipo_documento;
    const documentNumber = form.elements.numero_documento;
    if (documentType?.value && documentNumber?.value) {
      const number = documentNumber.value.trim();
      const valid = documentType.value === 'DNI' ? /^\d{8}$/.test(number)
        : documentType.value === 'CE' && /^\d{9}$/.test(number);
      if (!valid) invalidate(documentNumber, documentType.value === 'DNI'
        ? 'El DNI debe tener exactamente 8 dígitos.'
        : 'El carné de extranjería debe tener 9 dígitos.');
    }

    if (requirePasswords) {
      const password = form.elements.password;
      const confirmation = form.elements.confirmacion;
      if (password.value) {
        const bytes = new TextEncoder().encode(password.value).length;
        if (bytes < 12 || bytes > 72) {
          invalidate(password, 'La contraseña debe tener entre 12 y 72 bytes UTF-8.');
        }
      }
      if (password.value && confirmation.value && password.value !== confirmation.value) {
        invalidate(confirmation, 'La confirmación no coincide con la contraseña.');
      }
    }

    firstInvalid?.focus();
    return !firstInvalid;
  }

  function roleFor(id) {
    return catalogs?.roles.find((role) => role.id_rol === Number(id));
  }

  function inheritedPermissions(roleId) {
    return new Set(roleFor(roleId)?.permisos || []);
  }

  function fillFilters() {
    for (const role of catalogs.rolesFiltro) {
      const option = document.createElement('option');
      option.value = String(role.id_rol);
      option.textContent = role.nombre;
      roleFilter.append(option);
    }
    for (const role of catalogs.roles) {
      const option = document.createElement('option');
      option.value = String(role.id_rol);
      option.textContent = role.nombre;
      roleSelect.append(option);
    }
  }

  function renderPermissionEditor() {
    permissionList.replaceChildren();
    const roleId = Number(roleSelect.value);
    const inherited = inheritedPermissions(roleId);
    const groups = new Map();
    for (const permission of catalogs.permisos) {
      if (!groups.has(permission.modulo)) groups.set(permission.modulo, []);
      groups.get(permission.modulo).push(permission);
    }

    for (const [moduleCode, permissions] of groups) {
      const group = document.createElement('section');
      group.className = 'users-permission-module';
      const heading = document.createElement('h4');
      heading.textContent = MODULE_NAMES[moduleCode] || moduleCode.replaceAll('_', ' ').replace(/^\w/, (value) => value.toUpperCase());
      group.append(heading);

      for (const permission of permissions) {
        const row = document.createElement('div');
        row.className = 'users-permission-row';
        const info = document.createElement('div');
        const label = document.createElement('span');
        label.className = 'users-permission-title';
        label.textContent = ACTION_NAMES[permission.accion]
          || permission.accion.replaceAll('_', ' ').replace(/^\w/, (value) => value.toUpperCase());
        const code = document.createElement('span');
        code.className = 'users-permission-code';
        code.textContent = permission.codigo;
        const result = document.createElement('span');
        result.className = 'users-permission-result';
        result.dataset.permissionResult = String(permission.id_permiso);
        info.append(label, code, result);

        const select = document.createElement('select');
        select.className = 'input-custom';
        select.dataset.permissionSelect = String(permission.id_permiso);
        select.setAttribute('aria-label', `Acceso para ${permission.codigo}`);
        for (const [value, text] of [['inherit', 'Heredar del rol'], ['1', 'Permitir (excepción)'], ['0', 'Denegar (excepción)']]) {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = text;
          select.append(option);
        }

        const updateResult = () => {
          const isInherited = inherited.has(Number(permission.id_permiso));
          const exception = permissionDraft.get(Number(permission.id_permiso));
          const effective = exception === undefined ? isInherited : exception === 1;
          result.textContent = exception === undefined
            ? `Heredado del rol: ${effective ? 'Permitido' : 'Denegado'}`
            : `Excepción individual: ${effective ? 'Permitido' : 'Denegado'}`;
          result.classList.toggle('is-custom', exception !== undefined);
          select.value = exception === undefined ? 'inherit' : String(exception);
        };

        select.addEventListener('change', () => {
          const id = Number(permission.id_permiso);
          const selected = select.value === 'inherit' ? undefined : Number(select.value);
          const base = inherited.has(id) ? 1 : 0;
          if (selected === undefined || selected === base) permissionDraft.delete(id);
          else permissionDraft.set(id, selected);
          updateResult();
        });
        updateResult();
        row.append(info, select);
        group.append(row);
      }
      permissionList.append(group);
    }
  }

  function normalizeDraftForRole() {
    const inherited = inheritedPermissions(roleSelect.value);
    for (const [id, value] of permissionDraft) {
      if (value === (inherited.has(id) ? 1 : 0)) permissionDraft.delete(id);
    }
  }

  function permissionExceptions() {
    return [...permissionDraft].map(([id_permiso, permitido]) => ({ id_permiso, permitido }));
  }

  function createAction(label, action, user, { icon, className, disabled = false } = {}) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `btn-action ${className}`;
    button.dataset.userAction = action;
    button.dataset.userId = String(user.id_usuario);
    button.disabled = disabled;
    button.title = label;
    button.setAttribute('aria-label', label);
    const glyph = document.createElement('i');
    glyph.className = icon;
    glyph.setAttribute('aria-hidden', 'true');
    button.append(glyph);
    return button;
  }

  function renderUsers(users) {
    usersById = new Map(users.map((user) => [user.id_usuario, user]));
    listBody.replaceChildren();
    if (!users.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 7;
      cell.className = 'empty-state';
      cell.textContent = 'No hay usuarios que coincidan con los filtros.';
      row.append(cell);
      listBody.append(row);
      return;
    }

    for (const user of users) {
      const row = document.createElement('tr');
      const name = document.createElement('td');
      const fullName = document.createElement('span');
      fullName.className = 'cell-primary';
      fullName.textContent = `${user.nombres} ${user.apellidos}`;
      const email = document.createElement('small');
      email.className = 'cell-secondary';
      email.textContent = user.correo || '';
      name.append(fullName, email);
      const username = document.createElement('td');
      username.textContent = user.username;
      const documentCell = document.createElement('td');
      documentCell.textContent = [user.tipo_documento, user.numero_documento].filter(Boolean).join(' · ') || '—';
      const role = document.createElement('td');
      role.textContent = user.rol_nombre;
      const status = document.createElement('td');
      const badge = document.createElement('span');
      badge.className = `badge ${user.estado === 1 ? 'badge-success' : 'badge-danger'}`;
      badge.textContent = user.estado === 1 ? 'Activo' : 'Inactivo';
      status.append(badge);
      const created = document.createElement('td');
      created.textContent = formatDate(user.creado_en) || '—';
      const actions = document.createElement('td');
      const actionWrap = document.createElement('div');
      actionWrap.className = 'users-row-actions';
      if (user.rol_codigo !== 'administrador') {
        actionWrap.append(createAction('Editar usuario', 'edit', user, {
          icon: 'bi bi-pencil-square', className: 'btn-action-edit',
        }));
      }
      actionWrap.append(createAction('Cambiar contraseña', 'password', user, {
        icon: 'bi bi-key-fill', className: 'btn-action-view',
      }));
      const isCurrentUser = user.id_usuario === appState.auth.user?.id_usuario;
      const active = user.estado === 1;
      actionWrap.append(createAction(active ? 'Desactivar usuario' : 'Activar usuario', 'status', user, {
        icon: active ? 'bi bi-toggle-on' : 'bi bi-toggle-off',
        className: active ? 'inventory-state-off' : 'inventory-state-on',
        disabled: isCurrentUser,
      }));
      actions.append(actionWrap);
      row.append(name, username, documentCell, role, status, created, actions);
      listBody.append(row);
    }
  }

  async function loadUsers() {
    if (loading) return;
    loading = true;
    listStatus.textContent = 'Cargando usuarios…';
    const params = new URLSearchParams();
    if (search.value.trim()) params.set('q', search.value.trim());
    if (roleFilter.value !== 'todos') params.set('rol', roleFilter.value);
    if (statusFilter.value !== 'todos') params.set('estado', statusFilter.value);
    try {
      const users = await http(`/api/usuarios?${params.toString()}`);
      renderUsers(users);
      listStatus.textContent = users.length === 1 ? '1 usuario' : `${users.length} usuarios`;
    } catch (error) {
      listBody.replaceChildren();
      listStatus.textContent = error.message || 'No se pudo cargar la lista de usuarios.';
    } finally {
      loading = false;
    }
  }

  function fillForm(user = null, details = null) {
    editingUser = user;
    permissionDraft = new Map();
    editorForm.reset();
    clearFormValidation(editorForm);
    editorMessage.hidden = true;
    createPasswordFields.hidden = Boolean(user);
    editorForm.elements.password.required = !user;
    editorForm.elements.confirmacion.required = !user;
    document.getElementById('userEditorTitle').textContent = user ? 'Editar usuario' : 'Crear usuario';
    editorSave.textContent = user ? 'Guardar cambios' : 'Crear usuario';

    if (user) {
      for (const field of ['nombres', 'apellidos', 'tipo_documento', 'numero_documento', 'telefono', 'correo', 'username']) {
        editorForm.elements[field].value = user[field] ?? '';
      }
      if (!['DNI', 'CE'].includes(editorForm.elements.tipo_documento.value)) {
        const legacyType = editorForm.elements.tipo_documento.value.toLocaleLowerCase('es-PE');
        editorForm.elements.tipo_documento.value = legacyType.includes('extranj') ? 'CE' : '';
      }
      roleSelect.value = String(user.id_rol);
      details.permisos.forEach((permission) => {
        if (permission.excepcion !== null) permissionDraft.set(permission.id_permiso, permission.excepcion);
      });
      normalizeDraftForRole();
    } else {
      roleSelect.value = String(catalogs.roles[0]?.id_rol ?? '');
    }
    renderPermissionEditor();
  }

  async function openEditor(userId = null) {
    if (userId === null) {
      fillForm();
      openModal(editor);
      return;
    }
    try {
      const details = await http(`/api/usuarios/${userId}`);
      if (details.user.rol_codigo === 'administrador') {
        showToast('La cuenta Administrador está protegida.', 'warning');
        return;
      }
      fillForm(details.user, details);
      openModal(editor);
    } catch (error) {
      showToast(error.message || 'No se pudieron cargar los datos del usuario.', 'error');
    }
  }

  async function saveUser(event) {
    event.preventDefault();
    if (!validateForm(editorForm, { requirePasswords: !editingUser })) return;
    const formData = new FormData(editorForm);
    const body = Object.fromEntries(formData.entries());
    body.id_rol = Number(body.id_rol);
    body.permisos = permissionExceptions();
    if (editingUser) {
      delete body.password;
      delete body.confirmacion;
    }

    editorSave.disabled = true;
    editorSave.textContent = 'Guardando…';
    try {
      if (editingUser) await http(`/api/usuarios/${editingUser.id_usuario}`, 'PUT', body);
      else await http('/api/usuarios', 'POST', body);
      closeModal(editor);
      showToast(editingUser ? 'Usuario actualizado.' : 'Usuario creado.', 'success');
      await loadUsers();
    } catch (error) {
      showMessage(editorMessage, error.message || 'No se pudo guardar el usuario.');
    } finally {
      editorSave.disabled = false;
      editorSave.textContent = editingUser ? 'Guardar cambios' : 'Crear usuario';
    }
  }

  async function persistStatus(user, nextStatus, button = null, errorMessage = null) {
    if (button) button.disabled = true;
    try {
      await http(`/api/usuarios/${user.id_usuario}/estado`, 'PATCH', { estado: nextStatus });
      if (nextStatus === 0) deactivationModal.close();
      showToast(nextStatus === 1 ? 'Cuenta activada.' : 'Cuenta desactivada y sesiones revocadas.', 'success');
      await loadUsers();
    } catch (error) {
      if (errorMessage) {
        errorMessage.textContent = error.message || (nextStatus === 1 ? 'No se pudo activar la cuenta.' : 'No se pudo desactivar la cuenta.');
        errorMessage.hidden = false;
      }
      showToast(error.message || 'No se pudo cambiar el estado de la cuenta.', 'error');
    } finally {
      if (button?.isConnected) button.disabled = false;
    }
  }

  function confirmUserDeactivation(user) {
    const content = document.createElement('div');
    const message = document.createElement('p');
    message.className = 'category-confirm-message';
    message.append(document.createTextNode('Se desactivará la cuenta de '));
    const name = document.createElement('strong');
    name.textContent = `${user.nombres} ${user.apellidos}`;
    message.append(name, document.createTextNode(' y se revocarán sus sesiones activas.'));
    const errorMessage = document.createElement('p');
    errorMessage.className = 'field-error';
    errorMessage.setAttribute('role', 'alert');
    errorMessage.hidden = true;
    content.append(message, errorMessage);

    const deactivate = deactivationModal.createButton('Desactivar', 'btn-danger-action', () => {
      void persistStatus(user, 0, deactivate, errorMessage);
    });
    deactivate.dataset.requiresPermission = 'usuarios.desactivar';
    deactivationModal.open('Confirmar desactivación', 'La cuenta quedará inactiva y sus sesiones serán revocadas.', content, [
      deactivationModal.createButton('Cancelar', 'btn-cancel', () => deactivationModal.close()),
      deactivate,
    ]);
  }

  async function changeStatus(user) {
    const nextStatus = user.estado === 1 ? 0 : 1;
    if (nextStatus === 0) {
      confirmUserDeactivation(user);
      return;
    }
    await persistStatus(user, nextStatus);
  }

  function openPasswordEditor(user) {
    passwordUser = user;
    passwordForm.reset();
    clearFormValidation(passwordForm);
    passwordMessage.hidden = true;
    document.getElementById('userPasswordTitle').textContent = `Cambiar contraseña · ${user.username}`;
    openModal(passwordModal);
  }

  async function savePassword(event) {
    event.preventDefault();
    if (!validateForm(passwordForm, { requirePasswords: true })) return;
    const password = passwordForm.elements.password.value;
    const confirmation = passwordForm.elements.confirmacion.value;
    if (!window.confirm(`Se cerrarán las sesiones activas de ${passwordUser.username}. ¿Continuar?`)) return;
    passwordSave.disabled = true;
    try {
      await http(`/api/usuarios/${passwordUser.id_usuario}/contrasena`, 'PATCH', {
        password, confirmacion: confirmation,
      });
      const currentUserChanged = passwordUser.id_usuario === appState.auth.user?.id_usuario;
      closeModal(passwordModal);
      showToast('Contraseña actualizada; sus sesiones activas fueron revocadas.', 'success');
      if (currentUserChanged) {
        clearAuthContext();
        window.location.hash = '#/login';
      }
    } catch (error) {
      showMessage(passwordMessage, error.message || 'No se pudo cambiar la contraseña.');
    } finally {
      passwordSave.disabled = false;
    }
  }

  listBody.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-user-action]');
    if (!button) return;
    const user = usersById.get(Number(button.dataset.userId));
    if (!user) return;
    if (button.dataset.userAction === 'edit') await openEditor(user.id_usuario);
    else if (button.dataset.userAction === 'status') await changeStatus(user);
    else if (button.dataset.userAction === 'password') openPasswordEditor(user);
  });

  document.getElementById('userCreateButton').addEventListener('click', () => void openEditor());
  document.getElementById('userEditorClose').addEventListener('click', () => closeModal(editor));
  document.getElementById('userEditorCancel').addEventListener('click', () => closeModal(editor));
  document.getElementById('userPasswordClose').addEventListener('click', () => closeModal(passwordModal));
  document.getElementById('userPasswordCancel').addEventListener('click', () => closeModal(passwordModal));
  editor.addEventListener('click', (event) => { if (event.target === editor) closeModal(editor); });
  passwordModal.addEventListener('click', (event) => { if (event.target === passwordModal) closeModal(passwordModal); });
  editorForm.addEventListener('submit', saveUser);
  passwordForm.addEventListener('submit', savePassword);
  for (const form of [editorForm, passwordForm]) {
    form.addEventListener('input', (event) => clearFieldError(event.target));
    form.addEventListener('change', (event) => clearFieldError(event.target));
  }
  editorForm.elements.tipo_documento.addEventListener('change', () => {
    clearFieldError(editorForm.elements.tipo_documento);
    clearFieldError(editorForm.elements.numero_documento);
    const number = editorForm.elements.numero_documento.value.trim();
    if (!number) return;
    const type = editorForm.elements.tipo_documento.value;
    const valid = type === 'DNI' ? /^\d{8}$/.test(number) : type === 'CE' && /^\d{9}$/.test(number);
    if (!valid) markFieldError(editorForm.elements.numero_documento, type === 'DNI'
      ? 'El DNI debe tener exactamente 8 dígitos.'
      : 'El carné de extranjería debe tener 9 dígitos.');
  });
  roleSelect.addEventListener('change', () => {
    normalizeDraftForRole();
    renderPermissionEditor();
  });
  roleFilter.addEventListener('change', () => void loadUsers());
  statusFilter.addEventListener('change', () => void loadUsers());
  search.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => void loadUsers(), 250);
  });

  try {
    catalogs = await http('/api/usuarios/catalogos');
    fillFilters();
    await loadUsers();
  } catch (error) {
    listStatus.textContent = error.message || 'No se pudo cargar el módulo de usuarios.';
    showToast(error.message || 'No se pudo iniciar la administración de usuarios.', 'error');
  }
}
