import { Router } from 'express';
import { crearAvisosController } from '../controllers/avisosController.js';

export function crearRutasAvisos(servicios) {
  const controller = crearAvisosController(servicios);
  const router = Router();
  router.get('/', controller.listar);
  router.get('/resumen', controller.resumen);
  router.post('/leidos', controller.marcarLeidos);
  return router;
}
