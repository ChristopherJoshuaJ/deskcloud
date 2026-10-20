import { Router } from 'express';
import { crearEspaciosController } from '../controllers/espaciosController.js';

export function crearRutasEspacios(servicios) {
  const controller = crearEspaciosController(servicios);
  const router = Router();
  router.get('/', controller.listar);
  router.post('/', controller.crear);
  router.get('/:id', controller.detalles);
  router.patch('/:id', controller.renombrar);
  router.post('/:id/invitaciones', controller.invitar);
  router.delete('/:id/invitaciones/:invitacionId', controller.cancelarInvitacion);
  router.delete('/:id/miembros/:usuarioId', controller.expulsar);
  router.post('/:id/salir', controller.salir);
  router.get('/:id/actividad', controller.actividad);
  router.get('/:id/papelera', controller.papelera);
  router.get('/:id/propuestas', controller.propuestas);
  router.post('/:id/propuestas', controller.proponer);
  return router;
}
