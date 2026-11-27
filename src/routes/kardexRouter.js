import { Router } from 'express';
import { kardexController } from '../controllers/kardexController.js';
import { requireAuthentication, requirePermission } from '../services/authRuntime.js';

const router = Router();

router.get('/modelos', requireAuthentication, requirePermission('kardex.consultar'), kardexController.listarModelos);
router.get('/', requireAuthentication, requirePermission('kardex.consultar'), kardexController.listar);

export default router;
