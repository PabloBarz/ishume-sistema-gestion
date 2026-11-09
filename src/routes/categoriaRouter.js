import { Router } from 'express';
import { categoriaController } from '../controllers/categoriaController.js';

const router = Router();

router.get('/', categoriaController.listar);
router.post('/', categoriaController.crear);
router.get('/:id', categoriaController.obtener);
router.put('/:id', categoriaController.actualizar);
router.patch('/:id/estado', categoriaController.cambiarEstado);

export default router;
