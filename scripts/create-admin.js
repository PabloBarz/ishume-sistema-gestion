import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { pathToFileURL } from 'node:url';
import { pool } from '../src/config/db.js';
import { bootstrapAdministrator } from '../src/services/adminBootstrapService.js';

function askText(prompt) {
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  return readline.question(prompt).finally(() => readline.close());
}

function askHidden(prompt) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw new Error('The administrator password prompt requires an interactive terminal.');
  }
  process.stdout.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();

  return new Promise((resolve, reject) => {
    let value = '';
    const restore = () => {
      process.stdin.removeListener('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
    };
    const onData = (buffer) => {
      for (const character of buffer.toString('utf8')) {
        if (character === '\u0003') {
          restore();
          reject(new Error('Prompt cancelled.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          restore();
          resolve(value);
          return;
        }
        if (character === '\u007f' || character === '\b') {
          value = value.slice(0, -1);
        } else if (character >= ' ') {
          value += character;
        }
      }
    };
    process.stdin.on('data', onData);
  });
}

async function collectAdministratorInput() {
  const nombres = await askText('Nombres: ');
  const apellidos = await askText('Apellidos: ');
  const tipo_documento = await askText('Tipo de documento (opcional): ');
  const numero_documento = await askText('Número de documento (opcional): ');
  const telefono = await askText('Teléfono (opcional): ');
  const correo = await askText('Correo (opcional): ');
  const username = await askText('Username: ');
  const password = await askHidden('Contraseña inicial (mínimo 12 caracteres; no se mostrará): ');
  const confirmation = await askHidden('Confirma la contraseña: ');
  if (password !== confirmation) throw new Error('Las contraseñas no coinciden.');
  return {
    nombres, apellidos, tipo_documento, numero_documento, telefono, correo,
    username, password,
  };
}

export async function runCreateAdmin() {
  try {
    const input = await collectAdministratorInput();
    const created = await bootstrapAdministrator(input, { pool });
    process.stdout.write(`Administrador inicial creado para ${created.username}.\n`);
  } catch (error) {
    const message = error.message.startsWith('Ya existe un Administrador')
      ? error.message
      : error.code === 'ER_DUP_ENTRY'
        ? 'No se pudo crear el administrador: username o documento ya registrado.'
        : error instanceof TypeError
          ? error.message
          : 'No se pudo completar el bootstrap del administrador. Revisa la configuración y vuelve a intentarlo.';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runCreateAdmin();
}
