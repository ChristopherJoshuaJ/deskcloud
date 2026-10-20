import { Router } from 'express';
import { crearCuentaController } from '../controllers/cuentaController.js';

export function crearRutasCuenta({ cuenta, config }) {
  const controller = crearCuentaController({ cuenta, config });
  const router = Router();
  router.patch('/', controller.cambiarNombre);
  router.delete('/', controller.eliminar);
  router.put('/contrasena', controller.cambiarContrasena);
  router.get('/espacio-usado', controller.espacioUsado);
  router.get('/sesiones', controller.sesiones);
  router.post('/sesiones/cerrar-otras', controller.cerrarOtras);
  router.delete('/sesiones/:id', controller.cerrarSesion);
  return router;
}
