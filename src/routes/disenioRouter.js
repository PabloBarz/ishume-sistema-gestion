import { Router } from 'express';
import { disenioController } from '../controllers/disenioController.js';
import { requireAuthentication, requirePermission } from '../services/authRuntime.js';
import { csrfProtection } from '../middleware/authentication.js';

const router = Router();

router.get('/', requireAuthentication, requirePermission('disenios.consultar'), disenioController.listar);
router.post('/', csrfProtection, requireAuthentication, requirePermission('disenios.registrar'), disenioController.crear);
router.get('/:id', requireAuthentication, requirePermission('disenios.consultar'), disenioController.obtener);
router.put('/:id', csrfProtection, requireAuthentication, requirePermission('disenios.editar'), disenioController.actualizar);
router.patch('/:id/estado', csrfProtection, requireAuthentication, requirePermission('disenios.cambiar_estado'), disenioController.cambiarEstado);

export default router;
