import { createHash, randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

export class AuthenticationError extends Error {
  constructor(message = 'Credenciales o sesión no válidas.') {
    super(message);
    this.name = 'AuthenticationError';
    this.status = 401;
  }
}

const hashJti = (jti) => createHash('sha256').update(jti).digest('hex');

function safeUser(row) {
  return {
    id_usuario: Number(row.id_usuario),
    id_persona: Number(row.id_persona),
    username: row.username,
    nombres: row.nombres,
    apellidos: row.apellidos,
    correo: row.correo ?? null,
    id_rol: Number(row.id_rol),
    rol: row.rol_codigo,
  };
}

export function createAuthService({ pool, config, bcryptImpl = bcrypt, jwtImpl = jwt }) {
  if (!pool || !config?.secret) throw new TypeError('Auth service requires a database pool and auth config.');

  async function login(username, password) {
    if (typeof username !== 'string' || typeof password !== 'string') {
      throw new AuthenticationError();
    }

    const connection = await pool.getConnection();
    let transactionStarted = false;
    try {
      await connection.beginTransaction();
      transactionStarted = true;
      const [rows] = await connection.execute(
        `SELECT u.id_usuario, u.id_persona, u.username, u.password_hash,
                u.estado AS usuario_estado, u.id_rol,
                p.nombres, p.apellidos, p.correo, p.estado AS persona_estado,
                r.codigo AS rol_codigo, r.estado AS rol_estado
         FROM usuarios AS u
         JOIN personas AS p ON p.id_persona = u.id_persona
         JOIN roles AS r ON r.id_rol = u.id_rol
         WHERE u.username = ?
         LIMIT 1 FOR UPDATE`,
        [username],
      );
      const row = rows[0];
      if (!row) throw new AuthenticationError();

      const passwordMatches = await bcryptImpl.compare(password, row.password_hash);
      if (!passwordMatches || Number(row.usuario_estado) !== 1
          || Number(row.persona_estado) !== 1 || Number(row.rol_estado) !== 1) {
        throw new AuthenticationError();
      }

      const jti = randomUUID();
      const token = jwtImpl.sign(
        { sub: String(row.id_usuario), jti },
        config.secret,
        {
          algorithm: 'HS256',
          expiresIn: config.expiresIn,
          issuer: config.issuer,
          audience: config.audience,
        },
      );
      const { exp } = jwtImpl.decode(token);
      await connection.execute(
        'UPDATE usuarios SET ultimo_acceso = NOW() WHERE id_usuario = ?',
        [row.id_usuario],
      );
      await connection.execute(
        `INSERT INTO sesiones_usuario (id_usuario, jti_hash, expira_en)
         VALUES (?, ?, ?)`,
        [row.id_usuario, hashJti(jti), new Date(exp * 1000)],
      );
      await connection.commit();
      transactionStarted = false;
      return { token, user: safeUser(row), expiresAt: new Date(exp * 1000) };
    } catch (error) {
      if (transactionStarted) await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async function authenticate(token) {
    let payload;
    try {
      payload = jwtImpl.verify(token, config.secret, {
        algorithms: ['HS256'],
        issuer: config.issuer,
        audience: config.audience,
      });
    } catch {
      throw new AuthenticationError('Sesión no válida o vencida.');
    }
    if (!payload || !/^\d+$/.test(String(payload.sub)) || typeof payload.jti !== 'string') {
      throw new AuthenticationError('Sesión no válida o vencida.');
    }

    const [rows] = await pool.execute(
      `SELECT u.id_usuario, u.id_persona, u.username, u.id_rol,
              r.codigo AS rol_codigo, s.id_sesion
       FROM sesiones_usuario AS s
       JOIN usuarios AS u ON u.id_usuario = s.id_usuario
       JOIN personas AS p ON p.id_persona = u.id_persona
       JOIN roles AS r ON r.id_rol = u.id_rol
       WHERE s.jti_hash = ?
         AND s.id_usuario = ?
         AND s.revocada_en IS NULL
         AND s.expira_en > NOW()
         AND u.estado = 1
         AND p.estado = 1
         AND r.estado = 1
       LIMIT 1`,
      [hashJti(payload.jti), Number(payload.sub)],
    );
    const row = rows[0];
    if (!row) throw new AuthenticationError('Sesión no válida o vencida.');
    return {
      id_usuario: Number(row.id_usuario),
      id_persona: Number(row.id_persona),
      username: row.username,
      id_rol: Number(row.id_rol),
      rol: row.rol_codigo,
      id_sesion: Number(row.id_sesion),
      jti: payload.jti,
    };
  }

  async function hasPermission(idUsuario, permissionCode) {
    const [rows] = await pool.execute(
      `SELECT r.codigo AS rol_codigo,
              up.permitido,
              rp.id_permiso AS permiso_rol
       FROM usuarios AS u
       JOIN personas AS p ON p.id_persona = u.id_persona
       JOIN roles AS r ON r.id_rol = u.id_rol
       LEFT JOIN permisos AS pm ON pm.codigo = ?
       LEFT JOIN usuario_permisos AS up
         ON up.id_usuario = u.id_usuario AND up.id_permiso = pm.id_permiso
       LEFT JOIN rol_permisos AS rp
         ON rp.id_rol = u.id_rol AND rp.id_permiso = pm.id_permiso
       WHERE u.id_usuario = ?
         AND u.estado = 1 AND p.estado = 1 AND r.estado = 1
       LIMIT 1`,
      [permissionCode, idUsuario],
    );
    const row = rows[0];
    if (!row) return false;
    if (row.rol_codigo === 'administrador') return true;
    if (row.permitido !== null && row.permitido !== undefined) {
      return Number(row.permitido) === 1;
    }
    return row.permiso_rol !== null && row.permiso_rol !== undefined;
  }

  async function getCurrentUser(idUsuario) {
    const [userRows] = await pool.execute(
      `SELECT u.id_usuario, u.id_persona, u.username, u.id_rol,
              p.nombres, p.apellidos, p.correo, r.codigo AS rol_codigo
       FROM usuarios AS u
       JOIN personas AS p ON p.id_persona = u.id_persona
       JOIN roles AS r ON r.id_rol = u.id_rol
       WHERE u.id_usuario = ?
         AND u.estado = 1 AND p.estado = 1 AND r.estado = 1
       LIMIT 1`,
      [idUsuario],
    );
    const user = userRows[0];
    if (!user) throw new AuthenticationError('Sesión no válida o vencida.');

    const [permissionRows] = await pool.execute(
      `SELECT pm.codigo, up.permitido, rp.id_permiso AS permiso_rol
       FROM permisos AS pm
       LEFT JOIN usuario_permisos AS up
         ON up.id_permiso = pm.id_permiso AND up.id_usuario = ?
       LEFT JOIN rol_permisos AS rp
         ON rp.id_permiso = pm.id_permiso AND rp.id_rol = ?
       ORDER BY pm.codigo`,
      [idUsuario, user.id_rol],
    );
    const permissions = permissionRows
      .filter((permission) => user.rol_codigo === 'administrador'
        || (permission.permitido !== null && permission.permitido !== undefined
          ? Number(permission.permitido) === 1
          : permission.permiso_rol !== null && permission.permiso_rol !== undefined))
      .map((permission) => permission.codigo);

    return { user: safeUser(user), permissions };
  }

  async function logout(authenticatedUser) {
    if (!authenticatedUser?.jti || !authenticatedUser?.id_usuario) return;
    await pool.execute(
      `UPDATE sesiones_usuario
       SET revocada_en = COALESCE(revocada_en, NOW())
       WHERE id_usuario = ? AND jti_hash = ? AND revocada_en IS NULL`,
      [authenticatedUser.id_usuario, hashJti(authenticatedUser.jti)],
    );
  }

  return Object.freeze({ login, authenticate, hasPermission, getCurrentUser, logout });
}
