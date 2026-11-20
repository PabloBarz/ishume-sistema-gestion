import { Router } from 'express';
import { modeloController } from '../controllers/modeloController.js';
import { receiveModelImage } from '../middleware/modelImageUpload.js';
import { requireAuthentication, requirePermission } from '../services/authRuntime.js';
import { csrfProtection } from '../middleware/authentication.js';

const router = Router();

router.get('/', requireAuthentication, requirePermission('modelos.consultar'), modeloController.listar);
router.post('/', csrfProtection, requireAuthentication, requirePermission('modelos.registrar'), receiveModelImage, modeloController.crear);
router.get('/:id', requireAuthentication, requirePermission('modelos.consultar'), modeloController.obtener);
router.put('/:id', csrfProtection, requireAuthentication, requirePermission('modelos.editar'), receiveModelImage, modeloController.actualizar);
router.patch('/:id/estado', csrfProtection, requireAuthentication, requirePermission('modelos.cambiar_estado'), modeloController.cambiarEstado);

export default router;
