import { Router } from 'express';
import { inventarioProductoController } from '../controllers/inventarioProductoController.js';

const router = Router();

router.get('/', inventarioProductoController.listar);
router.post('/', inventarioProductoController.crear);
router.get('/:id', inventarioProductoController.obtener);
router.put('/:id', inventarioProductoController.actualizar);
router.patch('/:id/estado', inventarioProductoController.cambiarEstado);

export default router;
