import multer from 'multer';
import { MAX_MODEL_IMAGE_BYTES } from '../services/modelImageService.js';

const parser = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_MODEL_IMAGE_BYTES,
    files: 1,
    fields: 8,
    parts: 9,
    fieldNameSize: 64,
    fieldSize: 16 * 1024,
  },
}).single('imagen');

export function receiveModelImage(request, response, next) {
  parser(request, response, (error) => {
    if (!error) return next();
    if (error instanceof multer.MulterError) {
      const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      const message = error.code === 'LIMIT_FILE_SIZE'
        ? 'La imagen no puede superar los 5 MB.'
        : error.code === 'LIMIT_UNEXPECTED_FILE'
          ? 'Solo se permite un archivo en el campo "imagen".'
          : 'El formulario multipart excede los límites permitidos.';
      return response.status(status).json({ success: false, message });
    }
    return response.status(400).json({ success: false, message: 'No se pudo procesar el archivo enviado.' });
  });
}
