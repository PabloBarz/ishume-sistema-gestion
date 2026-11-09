import { Router } from 'express';
import { disenioController } from '../controllers/disenioController.js';

const router = Router();

router.get('/', disenioController.listar);
router.post('/', disenioController.crear);
router.get('/:id', disenioController.obtener);
router.put('/:id', disenioController.actualizar);
router.patch('/:id/estado', disenioController.cambiarEstado);

export default router;
