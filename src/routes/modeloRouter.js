import { Router } from 'express';
import { modeloController } from '../controllers/modeloController.js';
import { receiveModelImage } from '../middleware/modelImageUpload.js';

const router = Router();

router.get('/', modeloController.listar);
router.post('/', receiveModelImage, modeloController.crear);
router.get('/:id', modeloController.obtener);
router.put('/:id', receiveModelImage, modeloController.actualizar);
router.patch('/:id/estado', modeloController.cambiarEstado);

export default router;
