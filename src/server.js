import 'dotenv/config';
import './config/db.js';
import express from 'express';
import categoriaRouter from './routes/categoriaRouter.js';
import contratoRouter from './routes/contratoRouter.js';
import proveedorRouter from './routes/proveedorRouter.js';
import compraMasivaRouter from './routes/compraMasivaRouter.js';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const currentDirectory = dirname(fileURLToPath(import.meta.url));
const publicDirectory = resolve(currentDirectory, '../public');
const port = process.env.PORT || 3000;

app.use(express.static(publicDirectory));
app.use(express.json());

app.use('/api/categorias', categoriaRouter);
app.use('/api/contratos', contratoRouter);
app.use('/api/proveedores', proveedorRouter);
app.use('/api/compras-masivas', compraMasivaRouter);

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
