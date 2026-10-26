import { Router } from 'express';
import { modeloController } from '../controllers/modeloController.js';

const router = Router();

router.get('/', modeloController.listar);
router.post('/', modeloController.crear);
router.get('/:id', modeloController.obtener);
router.put('/:id', modeloController.actualizar);
router.patch('/:id/estado', modeloController.cambiarEstado);

export default router;
