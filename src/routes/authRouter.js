import { Router } from 'express';
import { getAuthRuntime, requireAuthentication, optionalAuthentication } from '../services/authRuntime.js';
import { createAuthController } from '../controllers/authController.js';
import { csrfProtection } from '../middleware/authentication.js';

const router = Router();
const controller = createAuthController(getAuthRuntime);

router.post('/login', csrfProtection, controller.login);
router.get('/me', requireAuthentication, controller.me);
router.post('/logout', csrfProtection, optionalAuthentication, controller.logout);

export default router;
