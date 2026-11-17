import { Router } from 'express';
import { catalogoIntegracionController } from '../controllers/catalogoIntegracionController.js';
import { requireIntegrationApiKey } from '../middleware/integrationApiKey.js';

const router = Router();

router.use(requireIntegrationApiKey);
router.get('/modelos', catalogoIntegracionController.listar);
router.get('/modelos/:id', catalogoIntegracionController.obtener);

export default router;
