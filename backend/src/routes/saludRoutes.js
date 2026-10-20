import { Router } from 'express';
import { crearSaludController } from '../controllers/saludController.js';

export function crearRutasSalud({ db }) {
  const controller = crearSaludController({ db });
  const router = Router();
  router.get('/', controller.estado);
  return router;
}
