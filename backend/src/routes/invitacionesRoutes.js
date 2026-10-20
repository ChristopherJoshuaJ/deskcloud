import { Router } from 'express';
import { crearInvitacionesController } from '../controllers/invitacionesController.js';

export function crearRutasInvitaciones(servicios) {
  const controller = crearInvitacionesController(servicios);
  const router = Router();
  router.get('/', controller.listar);
  router.post('/:id/aceptar', controller.aceptar);
  router.post('/:id/rechazar', controller.rechazar);
  return router;
}
