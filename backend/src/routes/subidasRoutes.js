import { Router } from 'express';
import { crearSubidasController } from '../controllers/subidasController.js';

// El cuerpo de estas peticiones son los bytes del archivo, no JSON.
export function crearRutasSubidas({ subidas }) {
  const controller = crearSubidasController({ subidas });
  const router = Router();
  router.post('/:carpetaId', controller.subir);
  return router;
}
