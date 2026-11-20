import { UserAdministrationError } from '../services/userAdministrationService.js';

export function createUserAdministrationController(service) {
  async function handle(res, next, operation, successStatus = 200) {
    try {
      const result = await operation();
      return res.status(successStatus).json(result);
    } catch (error) {
      if (error instanceof UserAdministrationError) {
        return res.status(error.status).json({ error: error.publicMessage });
      }
      return next(error);
    }
  }

  return {
    catalogs: (req, res, next) => handle(res, next, () => service.getCatalogs()),
    list: (req, res, next) => handle(res, next, () => service.listUsers(req.query)),
    get: (req, res, next) => handle(res, next, () => service.getUser(req.params.id)),
    create: (req, res, next) => handle(res, next, () => service.createUser(req.body), 201),
    update: (req, res, next) => handle(res, next, () => service.updateUser(
      req.params.id, req.body, req.auth.id_usuario,
    )),
    permissions: (req, res, next) => handle(res, next, () => service.updatePermissions(
      req.params.id, req.body?.permisos, req.auth.id_usuario,
    )),
    status: (req, res, next) => handle(res, next, () => service.setUserStatus(
      req.params.id, req.body?.estado, req.auth.id_usuario,
    )),
    password: (req, res, next) => handle(res, next, async () => {
      if (typeof req.body?.password !== 'string'
          || req.body.password !== req.body.confirmacion) {
        const error = new UserAdministrationError(400, 'La contraseña y su confirmación no coinciden.');
        throw error;
      }
      return service.changePassword(req.params.id, req.body.password, req.auth.id_usuario);
    }),
  };
}
