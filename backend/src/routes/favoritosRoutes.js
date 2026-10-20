import { Router } from 'express';
import { crearFavoritosController } from '../controllers/favoritosController.js';

export function crearRutasFavoritos({ favoritos }) {
  const controller = crearFavoritosController({ favoritos });
  const router = Router();
  router.get('/', controller.listar);
  router.post('/', controller.fijar);
  router.put('/orden', controller.reordenar);
  router.delete('/:nodoId', controller.quitar);
  return router;
}
