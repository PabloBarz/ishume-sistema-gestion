import 'dotenv/config';
import './config/db.js';
import express from 'express';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const currentDirectory = dirname(fileURLToPath(import.meta.url));
const publicDirectory = resolve(currentDirectory, '../public');
const port = process.env.PORT || 3000;

app.use(express.static(publicDirectory));

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Ruta de API no encontrada.' });
});

app.use((req, res) => {
  res.status(404).send('Página no encontrada.');
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);

  console.error(error);
  res.status(error.status || 500).json({ error: 'Error interno del servidor.' });
});

app.listen(port, () => {
  console.log(`ISHUME está disponible en http://localhost:${port}`);
});
