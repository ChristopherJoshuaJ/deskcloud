import { Router } from 'express';
import { crearPropuestasController } from '../controllers/propuestasController.js';

export function crearRutasPropuestas(servicios) {
  const controller = crearPropuestasController(servicios);
  const router = Router();
  router.get('/pendientes', controller.pendientes);
  router.get('/:id', controller.obtener);
  router.post('/:id/voto', controller.votar);
  router.post('/:id/retirar', controller.retirar);
  return router;
}
