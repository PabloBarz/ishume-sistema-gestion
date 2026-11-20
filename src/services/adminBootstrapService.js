import bcrypt from 'bcrypt';

const cleanOptional = (value) => value === '' || value === undefined ? null : value;

function validateAdminInput(input) {
  if (!input || typeof input !== 'object') throw new TypeError('Administrator data is required.');
  const names = ['nombres', 'apellidos', 'username', 'password'];
  for (const name of names) {
    if (typeof input[name] !== 'string' || !input[name].trim()) {
      throw new TypeError(`${name} is required.`);
    }
  }
  const normalized = {
    nombres: input.nombres.trim(),
    apellidos: input.apellidos.trim(),
    tipo_documento: cleanOptional(input.tipo_documento?.trim()),
    numero_documento: cleanOptional(input.numero_documento?.trim()),
    telefono: cleanOptional(input.telefono?.trim()),
    correo: cleanOptional(input.correo?.trim()),
    username: input.username.trim().toLowerCase(),
    password: input.password,
  };
  if (normalized.nombres.length > 120 || normalized.apellidos.length > 120
      || normalized.username.length > 60
      || (normalized.tipo_documento && normalized.tipo_documento.length > 30)
      || (normalized.numero_documento && normalized.numero_documento.length > 30)
      || (normalized.telefono && normalized.telefono.length > 30)
      || (normalized.correo && normalized.correo.length > 150)) {
    throw new TypeError('An administrator field exceeds its database limit.');
  }
  if (Boolean(normalized.tipo_documento) !== Boolean(normalized.numero_documento)) {
    throw new TypeError('Document type and number must be provided together.');
  }
  if (Buffer.byteLength(normalized.password, 'utf8') < 12
      || Buffer.byteLength(normalized.password, 'utf8') > 72) {
    throw new TypeError('The password must contain between 12 and 72 UTF-8 bytes.');
  }
  return normalized;
}

export async function bootstrapAdministrator(input, { pool, bcryptImpl = bcrypt } = {}) {
  if (!pool) throw new TypeError('A database pool is required.');
  const admin = validateAdminInput(input);
  const passwordHash = await bcryptImpl.hash(admin.password, 12);
  const connection = await pool.getConnection();
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;

    const [roles] = await connection.execute(
      `SELECT id_rol, estado
       FROM roles
       WHERE codigo = 'administrador'
       LIMIT 1 FOR UPDATE`,
    );
    const role = roles[0];
    if (!role || Number(role.estado) !== 1) {
      throw new Error('The seeded active administrator role was not found.');
    }

    const [countRows] = await connection.execute(
      `SELECT COUNT(*) AS activos
       FROM usuarios AS u
       JOIN personas AS p ON p.id_persona = u.id_persona
       JOIN roles AS r ON r.id_rol = u.id_rol
       WHERE u.id_rol = ?
         AND u.estado = 1 AND p.estado = 1 AND r.estado = 1`,
      [role.id_rol],
    );
    if (Number(countRows[0]?.activos || 0) > 0) {
      throw new Error('Ya existe un Administrador activo; el bootstrap inicial no está permitido.');
    }

    const [personResult] = await connection.execute(
      `INSERT INTO personas
         (nombres, apellidos, tipo_documento, numero_documento, telefono, correo)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [admin.nombres, admin.apellidos, admin.tipo_documento, admin.numero_documento,
        admin.telefono, admin.correo],
    );
    const [userResult] = await connection.execute(
      `INSERT INTO usuarios (id_persona, username, password_hash, id_rol)
       VALUES (?, ?, ?, ?)`,
      [personResult.insertId, admin.username, passwordHash, role.id_rol],
    );
    await connection.commit();
    transactionStarted = false;
    return { id_usuario: Number(userResult.insertId), username: admin.username };
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
