import { Router } from 'express';
import { csrfProtection } from '../middleware/authentication.js';
import { requireAdministrator, requireAuthentication, requirePermission } from '../services/authRuntime.js';
import { createUserAdministrationController } from '../controllers/userAdministrationController.js';
import { createUserAdministrationService } from '../services/userAdministrationService.js';
import { pool } from '../config/db.js';

const router = Router();
const controller = createUserAdministrationController(createUserAdministrationService({ pool }));

router.use(requireAuthentication, requireAdministrator);

router.get('/catalogos', requirePermission('usuarios.consultar'), controller.catalogs);
router.get('/', requirePermission('usuarios.consultar'), controller.list);
router.get('/:id', requirePermission('usuarios.consultar'), controller.get);
router.post('/', csrfProtection,
  requirePermission('usuarios.registrar'), requirePermission('usuarios.gestionar_permisos'), controller.create);
router.put('/:id', csrfProtection,
  requirePermission('usuarios.editar'), requirePermission('usuarios.gestionar_permisos'), controller.update);
router.put('/:id/permisos', csrfProtection, requirePermission('usuarios.gestionar_permisos'), controller.permissions);
router.patch('/:id/estado', csrfProtection, requirePermission('usuarios.desactivar'), controller.status);
router.patch('/:id/contrasena', csrfProtection, requirePermission('usuarios.editar'), controller.password);

export default router;
