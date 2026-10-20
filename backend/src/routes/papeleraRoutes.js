import { Router } from 'express';
import { crearPapeleraController } from '../controllers/papeleraController.js';

export function crearRutasPapelera({ papelera }) {
  const controller = crearPapeleraController({ papelera });
  const router = Router();
  router.get('/', controller.listar);
  router.post('/restaurar', controller.restaurar);
  router.post('/eliminar', controller.eliminar);
  router.post('/vaciar', controller.vaciar);
  return router;
}
