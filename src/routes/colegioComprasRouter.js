import {Router} from 'express';
import {colegioComprasController} from '../controllers/colegioComprasController.js';
import { requireAuthentication, requirePermission } from '../services/authRuntime.js';
const router=Router();
router.get('/',requireAuthentication,requirePermission('colegios.consultar'),colegioComprasController.buscar);
router.get('/:id',requireAuthentication,requirePermission('colegios.consultar'),colegioComprasController.obtener);
export default router;
