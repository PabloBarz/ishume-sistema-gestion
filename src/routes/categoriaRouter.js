import { Router } from 'express';
import { categoriaController } from '../controllers/categoriaController.js';
import { requireAuthentication, requirePermission } from '../services/authRuntime.js';
import { csrfProtection } from '../middleware/authentication.js';

const router = Router();

router.get('/', requireAuthentication, requirePermission('categorias.consultar'), categoriaController.listar);
router.post('/', csrfProtection, requireAuthentication, requirePermission('categorias.registrar'), categoriaController.crear);
router.get('/:id', requireAuthentication, requirePermission('categorias.consultar'), categoriaController.obtener);
router.put('/:id', csrfProtection, requireAuthentication, requirePermission('categorias.editar'), categoriaController.actualizar);
router.patch('/:id/estado', csrfProtection, requireAuthentication, requirePermission('categorias.cambiar_estado'), categoriaController.cambiarEstado);

export default router;
