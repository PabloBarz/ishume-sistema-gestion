import { Router } from 'express';
import cors from 'cors';
import { catalogoIntegracionController } from '../controllers/catalogoIntegracionController.js';

const router = Router();

export function createIntegrationCors(origin = process.env.PHP_SYSTEM_ORIGIN) {
  return cors({ origin: origin ? [origin] : false, methods: ['GET'] });
}

router.use(createIntegrationCors());
router.get('/', catalogoIntegracionController.listar);

export default router;
