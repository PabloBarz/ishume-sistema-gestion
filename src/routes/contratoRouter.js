import { Router } from 'express';
import { contratoController } from '../controllers/contratoController.js';
import { requireAuthentication, requirePermission } from '../services/authRuntime.js';

const router = Router();
router.get('/colegios', requireAuthentication, requirePermission('colegios.consultar'), contratoController.listarColegios);
router.get('/', requireAuthentication, requirePermission('contratos.consultar'), contratoController.consultar);
export default router;
