import { Router } from 'express';
import { contratoController } from '../controllers/contratoController.js';

const router = Router();
router.get('/', contratoController.consultar);
export default router;
