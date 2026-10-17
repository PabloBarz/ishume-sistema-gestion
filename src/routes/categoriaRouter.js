import { Router } from 'express';
import { categoriaController } from '../controllers/categoriaController.js';
//Datos de ejemplo para sintaxis
const router = Router();

// Define las operaciones disponibles para categorías.
router.get('/', categoriaController.listar);
router.post('/', categoriaController.registrar);

export default router;
