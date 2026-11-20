import { Router } from 'express';
import { proveedorController } from '../controllers/proveedorController.js';
import { requireAuthentication, requirePermission } from '../services/authRuntime.js';
const router = Router();
router.get('/', requireAuthentication, requirePermission('proveedores.consultar'), proveedorController.listar);
export default router;
