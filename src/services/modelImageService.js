import 'dotenv/config';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { mkdir, open, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MAX_MODEL_IMAGE_BYTES = 5 * 1024 * 1024;
export const MODEL_IMAGE_PUBLIC_PATH = '/uploads/modelos/';
const moduleDirectory = dirname(fileURLToPath(import.meta.url));
export const MODEL_IMAGE_STORAGE_DIRECTORY = resolve(moduleDirectory, '../../storage/uploads/modelos');

function configuredPublicBaseUrl() {
  const value = process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  let url;
  try { url = new URL(value); } catch { throw new Error('PUBLIC_BASE_URL debe ser una URL absoluta HTTP o HTTPS.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('PUBLIC_BASE_URL debe ser una URL absoluta HTTP o HTTPS sin credenciales.');
  }
  return url.origin;
}

export const MODEL_IMAGE_PUBLIC_BASE_URL = configuredPublicBaseUrl();

const fileNamePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:jpg|png|webp)$/i;
const allowedTypes = new Map([
  ['jpg', 'image/jpeg'],
  ['png', 'image/png'],
  ['webp', 'image/webp'],
]);

function imageError(message, status) {
  return Object.assign(new Error(message), { status });
}

function detectModelImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw imageError('El archivo de imagen está vacío o no es válido.', 415);
  }
  if (buffer.length > MAX_MODEL_IMAGE_BYTES) {
    throw imageError('La imagen no puede superar los 5 MB.', 413);
  }

  const jpeg = buffer.length >= 12 && buffer[0] === 0xff && buffer[1] === 0xd8 &&
    buffer[2] === 0xff && buffer.at(-2) === 0xff && buffer.at(-1) === 0xd9;
  if (jpeg) return { extension: 'jpg', mimeType: allowedTypes.get('jpg') };

  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const png = buffer.length >= 45 && buffer.subarray(0, 8).equals(pngSignature) &&
    buffer.subarray(12, 16).toString('ascii') === 'IHDR' &&
    buffer.subarray(-8, -4).toString('ascii') === 'IEND';
  if (png) return { extension: 'png', mimeType: allowedTypes.get('png') };

  const webp = buffer.length >= 30 && buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP' && buffer.readUInt32LE(4) === buffer.length - 8 &&
    ['VP8 ', 'VP8L', 'VP8X'].includes(buffer.toString('ascii', 12, 16));
  if (webp) return { extension: 'webp', mimeType: allowedTypes.get('webp') };

  throw imageError('Formato de imagen no válido. Sube un archivo JPG, PNG o WEBP válido.', 415);
}

export function getModelImageUrl(imagePath, publicBaseUrl = MODEL_IMAGE_PUBLIC_BASE_URL) {
  if (imagePath == null) return null;
  if (typeof imagePath !== 'string' || !imagePath.startsWith(MODEL_IMAGE_PUBLIC_PATH)) return null;
  const filename = imagePath.slice(MODEL_IMAGE_PUBLIC_PATH.length);
  if (!fileNamePattern.test(filename)) return null;
  let base;
  try { base = new URL(publicBaseUrl); } catch { return null; }
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) return null;
  return `${base.origin}${MODEL_IMAGE_PUBLIC_PATH}${filename}`;
}

export function withModelImageUrl(model) {
  const safePath = getModelImageUrl(model?.imagen_path) ? model.imagen_path : null;
  return { ...model, imagen_path: safePath, imagen_url: getModelImageUrl(safePath) };
}

export function createModelImageStorage(directory = MODEL_IMAGE_STORAGE_DIRECTORY) {
  const storageDirectory = resolve(directory);

  return {
    async save(file) {
      const { buffer } = file ?? {};
      const { extension } = detectModelImage(buffer);
      await mkdir(storageDirectory, { recursive: true });

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const filename = `${randomUUID()}.${extension}`;
        const absolutePath = resolve(storageDirectory, filename);
        let handle;
        try {
          handle = await open(absolutePath, 'wx', 0o640);
          await handle.writeFile(buffer);
          return `${MODEL_IMAGE_PUBLIC_PATH}${filename}`;
        } catch (error) {
          if (error.code === 'EEXIST') continue;
          if (handle) await handle.close().catch(() => {});
          await unlink(absolutePath).catch(() => {});
          throw error;
        } finally {
          if (handle) await handle.close().catch(() => {});
        }
      }
      throw imageError('No se pudo asignar un nombre seguro a la imagen.', 500);
    },

    async remove(imagePath) {
      if (typeof imagePath !== 'string' || !imagePath.startsWith(MODEL_IMAGE_PUBLIC_PATH)) return false;
      const filename = imagePath.slice(MODEL_IMAGE_PUBLIC_PATH.length);
      if (!fileNamePattern.test(filename)) return false;
      const absolutePath = resolve(storageDirectory, filename);
      if (dirname(absolutePath) !== storageDirectory) return false;
      try {
        await unlink(absolutePath);
        return true;
      } catch (error) {
        if (error.code === 'ENOENT') return false;
        throw error;
      }
    },
  };
}

export const modelImageStorage = createModelImageStorage();

export async function persistModelImageChange({
  file,
  missingImagePath = undefined,
  persist,
  removePrevious = async () => {},
  storage = modelImageStorage,
}) {
  const newImagePath = file ? await storage.save(file) : missingImagePath;
  let result;
  try {
    result = await persist(newImagePath);
  } catch (error) {
    if (file && newImagePath) {
      try { await storage.remove(newImagePath); } catch (cleanupError) {
        console.error('No se pudo limpiar la nueva imagen tras fallar el guardado:', cleanupError);
      }
    }
    throw error;
  }

  if (file && result?.previousImagePath && result.previousImagePath !== newImagePath) {
    try { await removePrevious(result.previousImagePath); } catch (error) {
      console.error('No se pudo limpiar la imagen reemplazada:', error);
    }
  }
  return result;
}

export function createModelImageStaticMiddleware(directory = MODEL_IMAGE_STORAGE_DIRECTORY) {
  const staticFiles = express.static(resolve(directory), {
    dotfiles: 'deny',
    index: false,
    redirect: false,
    setHeaders(response) {
      response.setHeader('X-Content-Type-Options', 'nosniff');
      response.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      response.setHeader('Content-Disposition', 'inline');
      response.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    },
  });

  return (request, response, next) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') return response.status(405).end();
    const filename = request.path.startsWith('/') ? request.path.slice(1) : request.path;
    if (!fileNamePattern.test(filename)) return response.status(404).end();
    return staticFiles(request, response, next);
  };
}
