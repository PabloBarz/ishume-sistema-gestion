import bcrypt from 'bcrypt';

const ASSIGNABLE_ROLE_CODES = ['consulta', 'operador_confianza'];

export class UserAdministrationError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'UserAdministrationError';
    this.status = status;
    this.publicMessage = message;
  }
}

const badRequest = (message) => new UserAdministrationError(400, message);
const notFound = () => new UserAdministrationError(404, 'No se encontró el usuario solicitado.');
const conflict = (message) => new UserAdministrationError(409, message);
const positiveId = (value, name = 'identificador') => {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1) throw badRequest(`El ${name} no es válido.`);
  return number;
};

function requiredText(value, label, maxLength) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw badRequest(`${label} es obligatorio y admite hasta ${maxLength} caracteres.`);
  }
  return value.trim();
}

function optionalText(value, label, maxLength) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > maxLength) {
    throw badRequest(`${label} admite hasta ${maxLength} caracteres.`);
  }
  return value.trim() || null;
}

function normalizePersonAndAccount(input, { includePassword = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw badRequest('Datos de usuario no válidos.');
  const username = requiredText(input.username, 'El nombre de usuario', 60).toLowerCase();
  const person = {
    nombres: requiredText(input.nombres, 'Nombres', 120),
    apellidos: requiredText(input.apellidos, 'Apellidos', 120),
    tipo_documento: requiredText(input.tipo_documento, 'Tipo de documento', 30),
    numero_documento: requiredText(input.numero_documento, 'Número de documento', 30),
    telefono: optionalText(input.telefono, 'Teléfono', 30),
    correo: optionalText(input.correo, 'Correo', 150),
  };
  if (person.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(person.correo)) {
    throw badRequest('El correo no tiene un formato válido.');
  }
  const normalized = { ...person, username, id_rol: positiveId(input.id_rol, 'rol') };
  if (includePassword) normalized.password = validatePassword(input.password);
  return normalized;
}

function validatePassword(value) {
  if (typeof value !== 'string') throw badRequest('La contraseña debe tener entre 12 y 72 bytes UTF-8.');
  const length = Buffer.byteLength(value, 'utf8');
  if (length < 12 || length > 72) throw badRequest('La contraseña debe tener entre 12 y 72 bytes UTF-8.');
  return value;
}

function normalizeExceptions(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw badRequest('La lista de excepciones no es válida.');
  const seen = new Set();
  return value.map((entry) => {
    const id_permiso = positiveId(entry?.id_permiso, 'permiso');
    if (seen.has(id_permiso)) throw badRequest('La lista contiene permisos duplicados.');
    seen.add(id_permiso);
    if (entry.permitido !== 0 && entry.permitido !== 1) {
      throw badRequest('Cada excepción debe permitir o denegar explícitamente el permiso.');
    }
    return { id_permiso, permitido: entry.permitido };
  });
}

function safeUser(row) {
  return {
    id_usuario: Number(row.id_usuario),
    id_persona: Number(row.id_persona),
    nombres: row.nombres,
    apellidos: row.apellidos,
    tipo_documento: row.tipo_documento ?? null,
    numero_documento: row.numero_documento ?? null,
    telefono: row.telefono ?? null,
    correo: row.correo ?? null,
    username: row.username,
    id_rol: Number(row.id_rol),
    rol_codigo: row.rol_codigo,
    rol_nombre: row.rol_nombre,
    estado: Number(row.estado),
    creado_en: row.creado_en,
  };
}

export function createUserAdministrationService({ pool, bcryptImpl = bcrypt }) {
  if (!pool) throw new TypeError('User administration service requires a database pool.');

  async function transaction(work) {
    const connection = await pool.getConnection();
    let started = false;
    try {
      await connection.beginTransaction();
      started = true;
      const result = await work(connection);
      await connection.commit();
      started = false;
      return result;
    } catch (error) {
      if (started) await connection.rollback();
      if (error.code === 'ER_DUP_ENTRY') throw conflict('El nombre de usuario o documento ya está registrado.');
      throw error;
    } finally {
      connection.release();
    }
  }

  async function assignableRole(connection, roleId) {
    const [rows] = await connection.execute(
      `SELECT id_rol, codigo, nombre, estado
       FROM roles WHERE id_rol = ? FOR UPDATE`,
      [roleId],
    );
    const role = rows[0];
    if (!role || Number(role.estado) !== 1) throw badRequest('El rol seleccionado no está disponible.');
    if (!ASSIGNABLE_ROLE_CODES.includes(role.codigo)) {
      throw badRequest('El rol Administrador es reservado y no se puede asignar desde este módulo.');
    }
    return role;
  }

  async function ensureUniqueIdentity(connection, user, exceptPersonId = null, exceptUserId = null) {
    const [userRows] = await connection.execute(
      'SELECT id_usuario FROM usuarios WHERE username = ? AND id_usuario <> COALESCE(?, 0) LIMIT 1',
      [user.username, exceptUserId],
    );
    if (userRows.length) throw conflict('Ese nombre de usuario ya está registrado.');
    const [documentRows] = await connection.execute(
      `SELECT id_persona FROM personas
       WHERE tipo_documento = ? AND numero_documento = ?
         AND id_persona <> COALESCE(?, 0)
       LIMIT 1`,
      [user.tipo_documento, user.numero_documento, exceptPersonId],
    );
    if (documentRows.length) throw conflict('Ese documento ya está registrado.');
  }

  async function saveExceptions(connection, userId, roleId, exceptions) {
    const normalized = normalizeExceptions(exceptions) ?? [];
    const [catalogRows] = await connection.execute('SELECT id_permiso FROM permisos');
    const knownPermissions = new Set(catalogRows.map((row) => Number(row.id_permiso)));
    for (const exception of normalized) {
      if (!knownPermissions.has(exception.id_permiso)) throw badRequest('La lista contiene un permiso inexistente.');
    }
    const [inheritedRows] = await connection.execute(
      'SELECT id_permiso FROM rol_permisos WHERE id_rol = ?', [roleId],
    );
    const inherited = new Set(inheritedRows.map((row) => Number(row.id_permiso)));
    await connection.execute('DELETE FROM usuario_permisos WHERE id_usuario = ?', [userId]);
    for (const exception of normalized) {
      const inheritedValue = inherited.has(exception.id_permiso) ? 1 : 0;
      if (exception.permitido === inheritedValue) continue;
      await connection.execute(
        `INSERT INTO usuario_permisos (id_usuario, id_permiso, permitido)
         VALUES (?, ?, ?)`,
        [userId, exception.id_permiso, exception.permitido],
      );
    }
  }

  async function fetchUser(connectionOrPool, userId, { forUpdate = false } = {}) {
    const [rows] = await connectionOrPool.execute(
      `SELECT u.id_usuario, u.id_persona, u.username, u.id_rol, u.estado, u.creado_en,
              p.nombres, p.apellidos, p.tipo_documento, p.numero_documento, p.telefono, p.correo,
              r.codigo AS rol_codigo, r.nombre AS rol_nombre, r.estado AS rol_estado,
              p.estado AS persona_estado
       FROM usuarios AS u
       JOIN personas AS p ON p.id_persona = u.id_persona
       JOIN roles AS r ON r.id_rol = u.id_rol
       WHERE u.id_usuario = ?${forUpdate ? ' FOR UPDATE' : ''}`,
      [userId],
    );
    return rows[0] || null;
  }

  async function listUsers(filters = {}) {
    const conditions = [];
    const params = [];
    const search = typeof filters.q === 'string' ? filters.q.trim().slice(0, 120) : '';
    if (search) {
      const pattern = `%${search}%`;
      conditions.push('(p.nombres LIKE ? OR p.apellidos LIKE ? OR u.username LIKE ? OR CONCAT(p.nombres, " ", p.apellidos) LIKE ?)');
      params.push(pattern, pattern, pattern, pattern);
    }
    if (filters.rol !== undefined && filters.rol !== '' && filters.rol !== 'todos') {
      conditions.push('u.id_rol = ?');
      params.push(positiveId(filters.rol, 'rol'));
    }
    if (filters.estado !== undefined && filters.estado !== '' && filters.estado !== 'todos') {
      if (!['0', '1', 0, 1].includes(filters.estado)) throw badRequest('El filtro de estado no es válido.');
      conditions.push('u.estado = ?');
      params.push(Number(filters.estado));
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const [rows] = await pool.execute(
      `SELECT u.id_usuario, u.id_persona, u.username, u.id_rol, u.estado, u.creado_en,
              p.nombres, p.apellidos, p.tipo_documento, p.numero_documento, p.telefono, p.correo,
              r.codigo AS rol_codigo, r.nombre AS rol_nombre
       FROM usuarios AS u
       JOIN personas AS p ON p.id_persona = u.id_persona
       JOIN roles AS r ON r.id_rol = u.id_rol
       ${where}
       ORDER BY p.apellidos, p.nombres, u.username`,
      params,
    );
    return rows.map(safeUser);
  }

  async function getCatalogs() {
    const [roleRows] = await pool.execute(
      `SELECT id_rol, codigo, nombre, descripcion
       FROM roles WHERE codigo IN (?, ?) AND estado = 1 ORDER BY id_rol`,
      ASSIGNABLE_ROLE_CODES,
    );
    const [permissionRows] = await pool.execute(
      `SELECT id_permiso, codigo, modulo, accion, descripcion
       FROM permisos ORDER BY modulo, accion, codigo`,
    );
    const [inheritedRows] = await pool.execute(
      `SELECT rp.id_rol, rp.id_permiso
       FROM rol_permisos AS rp
       JOIN roles AS r ON r.id_rol = rp.id_rol
       WHERE r.codigo IN (?, ?)`,
      ASSIGNABLE_ROLE_CODES,
    );
    const [roleFilterRows] = await pool.execute(
      'SELECT id_rol, codigo, nombre FROM roles ORDER BY nombre',
    );
    const rolePermissions = new Map();
    inheritedRows.forEach((row) => {
      const id = Number(row.id_rol);
      if (!rolePermissions.has(id)) rolePermissions.set(id, []);
      rolePermissions.get(id).push(Number(row.id_permiso));
    });
    return {
      rolesFiltro: roleFilterRows.map((role) => ({
        id_rol: Number(role.id_rol), codigo: role.codigo, nombre: role.nombre,
      })),
      roles: roleRows.map((role) => ({
        id_rol: Number(role.id_rol), codigo: role.codigo, nombre: role.nombre,
        descripcion: role.descripcion, permisos: rolePermissions.get(Number(role.id_rol)) || [],
      })),
      permisos: permissionRows.map((permission) => ({
        ...permission, id_permiso: Number(permission.id_permiso),
      })),
    };
  }

  async function getUser(userId) {
    const id = positiveId(userId, 'usuario');
    const user = await fetchUser(pool, id);
    if (!user) throw notFound();
    const [rows] = await pool.execute(
      `SELECT p.id_permiso, p.codigo, p.modulo, p.accion, p.descripcion,
              rp.id_permiso AS heredado, up.permitido
       FROM permisos AS p
       LEFT JOIN rol_permisos AS rp ON rp.id_permiso = p.id_permiso AND rp.id_rol = ?
       LEFT JOIN usuario_permisos AS up ON up.id_permiso = p.id_permiso AND up.id_usuario = ?
       ORDER BY p.modulo, p.accion, p.codigo`,
      [user.id_rol, id],
    );
    const administrator = user.rol_codigo === 'administrador';
    return {
      user: safeUser(user),
      permisos: rows.map((permission) => {
        const inherited = permission.heredado !== null && permission.heredado !== undefined;
        const exception = permission.permitido === null || permission.permitido === undefined
          ? null : Number(permission.permitido);
        return {
          id_permiso: Number(permission.id_permiso),
          codigo: permission.codigo,
          modulo: permission.modulo,
          accion: permission.accion,
          descripcion: permission.descripcion,
          heredado: administrator || inherited,
          excepcion: administrator ? null : exception,
          efectivo: administrator || (exception === null ? inherited : exception === 1),
        };
      }),
    };
  }

  async function createUser(input) {
    const user = normalizePersonAndAccount(input, { includePassword: true });
    const exceptions = normalizeExceptions(input.permisos) ?? [];
    const passwordHash = await bcryptImpl.hash(user.password, 12);
    return transaction(async (connection) => {
      const role = await assignableRole(connection, user.id_rol);
      await ensureUniqueIdentity(connection, user);
      const [personResult] = await connection.execute(
        `INSERT INTO personas
          (nombres, apellidos, tipo_documento, numero_documento, telefono, correo)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [user.nombres, user.apellidos, user.tipo_documento, user.numero_documento, user.telefono, user.correo],
      );
      const [userResult] = await connection.execute(
        `INSERT INTO usuarios (id_persona, username, password_hash, id_rol)
         VALUES (?, ?, ?, ?)`,
        [personResult.insertId, user.username, passwordHash, role.id_rol],
      );
      await saveExceptions(connection, Number(userResult.insertId), Number(role.id_rol), exceptions);
      return { id_usuario: Number(userResult.insertId) };
    });
  }

  async function updateUser(userId, input, actorId) {
    const id = positiveId(userId, 'usuario');
    const actor = positiveId(actorId, 'administrador');
    if (id === actor) throw conflict('No puedes modificar tus propios datos de acceso desde esta sección.');
    const user = normalizePersonAndAccount(input);
    const exceptions = normalizeExceptions(input.permisos);
    return transaction(async (connection) => {
      const current = await fetchUser(connection, id, { forUpdate: true });
      if (!current) throw notFound();
      if (current.rol_codigo === 'administrador') {
        throw conflict('La cuenta Administrador está protegida y no se puede editar desde este módulo.');
      }
      const role = await assignableRole(connection, user.id_rol);
      await ensureUniqueIdentity(connection, user, Number(current.id_persona), id);
      await connection.execute(
        `UPDATE personas
         SET nombres = ?, apellidos = ?, tipo_documento = ?, numero_documento = ?, telefono = ?, correo = ?
         WHERE id_persona = ?`,
        [user.nombres, user.apellidos, user.tipo_documento, user.numero_documento,
          user.telefono, user.correo, current.id_persona],
      );
      await connection.execute(
        'UPDATE usuarios SET username = ?, id_rol = ? WHERE id_usuario = ?',
        [user.username, role.id_rol, id],
      );
      if (exceptions !== undefined) {
        await saveExceptions(connection, id, Number(role.id_rol), exceptions);
      } else if (Number(current.id_rol) !== Number(role.id_rol)) {
        const [existing] = await connection.execute(
          'SELECT id_permiso, permitido FROM usuario_permisos WHERE id_usuario = ?', [id],
        );
        await saveExceptions(connection, id, Number(role.id_rol), existing.map((row) => ({
          id_permiso: Number(row.id_permiso), permitido: Number(row.permitido),
        })));
      }
      return { id_usuario: id };
    });
  }

  async function updatePermissions(userId, exceptions, actorId) {
    const id = positiveId(userId, 'usuario');
    if (id === positiveId(actorId, 'administrador')) {
      throw conflict('No puedes asignarte excepciones de permisos a ti mismo.');
    }
    const normalized = normalizeExceptions(exceptions);
    if (normalized === undefined) throw badRequest('Debes enviar la lista de permisos individuales.');
    return transaction(async (connection) => {
      const target = await fetchUser(connection, id, { forUpdate: true });
      if (!target) throw notFound();
      if (target.rol_codigo === 'administrador') {
        throw conflict('La cuenta Administrador tiene acceso completo y no admite excepciones individuales.');
      }
      await saveExceptions(connection, id, Number(target.id_rol), normalized);
      return { id_usuario: id };
    });
  }

  async function setUserStatus(userId, status, actorId) {
    const id = positiveId(userId, 'usuario');
    const actor = positiveId(actorId, 'administrador');
    if (status !== 0 && status !== 1) throw badRequest('El estado debe ser activo o inactivo.');
    if (id === actor) throw conflict('No puedes desactivar tu propia cuenta Administrador.');
    return transaction(async (connection) => {
      const [adminRoles] = await connection.execute(
        `SELECT id_rol FROM roles WHERE codigo = 'administrador' FOR UPDATE`,
      );
      if (!adminRoles.length) throw conflict('No se encontró el rol Administrador reservado.');
      const target = await fetchUser(connection, id, { forUpdate: true });
      if (!target) throw notFound();
      if (Number(target.estado) === status) return { id_usuario: id, estado: status };
      if (status === 0 && target.rol_codigo === 'administrador') {
        const [rows] = await connection.execute(
          `SELECT COUNT(*) AS total
           FROM usuarios AS u
           JOIN personas AS p ON p.id_persona = u.id_persona
           JOIN roles AS r ON r.id_rol = u.id_rol
           WHERE u.id_rol = ? AND u.estado = 1 AND p.estado = 1 AND r.estado = 1`,
          [adminRoles[0].id_rol],
        );
        if (Number(rows[0]?.total || 0) <= 1) {
          throw conflict('No se puede desactivar al último Administrador activo.');
        }
      }
      await connection.execute('UPDATE usuarios SET estado = ? WHERE id_usuario = ?', [status, id]);
      if (status === 0) {
        await connection.execute(
          `UPDATE sesiones_usuario
           SET revocada_en = COALESCE(revocada_en, NOW())
           WHERE id_usuario = ? AND revocada_en IS NULL`,
          [id],
        );
      }
      return { id_usuario: id, estado: status };
    });
  }

  async function changePassword(userId, password, actorId) {
    const id = positiveId(userId, 'usuario');
    const actor = positiveId(actorId, 'administrador');
    const normalizedPassword = validatePassword(password);
    const passwordHash = await bcryptImpl.hash(normalizedPassword, 12);
    return transaction(async (connection) => {
      const target = await fetchUser(connection, id, { forUpdate: true });
      if (!target) throw notFound();
      await connection.execute(
        'UPDATE usuarios SET password_hash = ? WHERE id_usuario = ?', [passwordHash, id],
      );
      await connection.execute(
        `UPDATE sesiones_usuario
         SET revocada_en = COALESCE(revocada_en, NOW())
         WHERE id_usuario = ? AND revocada_en IS NULL`,
        [id],
      );
      return { id_usuario: id, requiere_nuevo_login: id === actor };
    });
  }

  return Object.freeze({
    listUsers, getCatalogs, getUser, createUser, updateUser,
    updatePermissions, setUserStatus, changePassword,
  });
}
