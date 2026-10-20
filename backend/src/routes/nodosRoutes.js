import { Router } from 'express';
import { crearNodosController } from '../controllers/nodosController.js';

export function crearRutasNodos(servicios) {
  const controller = crearNodosController(servicios);
  const router = Router();

  router.post('/mover', controller.mover);
  router.post('/copiar', controller.copiar);
  router.post('/papelera', controller.enviarAPapelera);
  router.post('/visto', controller.marcarVisto);

  router.get('/:id', controller.detalles);
  router.patch('/:id', controller.renombrar);
  router.put('/:id/color', controller.cambiarColor);
  router.get('/:id/contenido', controller.contenido);
  router.get('/:id/subcarpetas', controller.subcarpetas);
  router.get('/:id/buscar', controller.buscar);
  router.get('/:id/descarga', controller.descargar);
  router.get('/:id/zip', controller.descargarZip);
  router.get('/:id/vista', controller.vista);
  router.post('/:id/carpetas', controller.crearCarpeta);
  router.post('/:id/verificar-nombres', controller.verificarNombres);

  router.get('/:id/versiones', controller.versiones);
  router.get('/:id/versiones/:versionId/descarga', controller.descargarVersion);
  router.get('/:id/versiones/:versionId/vista', controller.vistaVersion);
  router.post('/:id/versiones/:versionId/restaurar', controller.restaurarVersion);
  router.delete('/:id/versiones/:versionId', controller.eliminarVersion);

  // El texto llega como text/plain, que express.json() no consume.
  router.get('/:id/texto', controller.leerTexto);
  router.put('/:id/texto', controller.guardarTexto);
  return router;
}
