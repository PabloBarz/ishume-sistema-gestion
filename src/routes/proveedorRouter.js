import { Router } from 'express';
import { proveedorController } from '../controllers/proveedorController.js';
const router = Router();
router.get('/', proveedorController.listar);
export default router;
