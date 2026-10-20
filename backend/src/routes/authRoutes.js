import { Router } from 'express';
import { crearAuthController } from '../controllers/authController.js';

export function crearRutasAuth({ authService, requiereSesion, config }) {
  const controller = crearAuthController({ authService, config });
  const router = Router();
  router.post('/registro', controller.registro);
  router.post('/login', controller.login);
  router.post('/logout', controller.logout);
  router.get('/me', requiereSesion, controller.me);
  return router;
}
