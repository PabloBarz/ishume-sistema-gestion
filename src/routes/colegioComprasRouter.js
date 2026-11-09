import {Router} from 'express';
import {colegioComprasController} from '../controllers/colegioComprasController.js';
const router=Router();
router.get('/',colegioComprasController.buscar);
router.get('/:id',colegioComprasController.obtener);
export default router;
