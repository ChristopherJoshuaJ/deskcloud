import express from 'express';
import { crearRutasFrontend } from './http/frontend.js';
import { manejarErrores, rutaApiNoEncontrada } from './middlewares/errores.js';
import { crearRequiereSesion } from './middlewares/requiereSesion.js';
import { crearVerificarOrigen } from './middlewares/verificarOrigen.js';
import { crearRutasAuth } from './routes/authRoutes.js';
import { crearRutasAvisos } from './routes/avisosRoutes.js';
import { crearRutasColores } from './routes/coloresRoutes.js';
import { crearRutasCuenta } from './routes/cuentaRoutes.js';
import { crearRutasEspacios } from './routes/espaciosRoutes.js';
import { crearRutasFavoritos } from './routes/favoritosRoutes.js';
import { crearRutasInvitaciones } from './routes/invitacionesRoutes.js';
import { crearRutasNodos } from './routes/nodosRoutes.js';
import { crearRutasPapelera } from './routes/papeleraRoutes.js';
import { crearRutasPropuestas } from './routes/propuestasRoutes.js';
import { crearRutasSalud } from './routes/saludRoutes.js';
import { crearRutasSubidas } from './routes/subidasRoutes.js';
import { crearMiddlewareSesion } from './sesiones/index.js';

export function crearApp({ db, servicios, config }) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'SAMEORIGIN',
      'Referrer-Policy': 'same-origin',
    });
    next();
  });

  const requiereSesion = crearRequiereSesion({ authService: servicios.auth });

  app.use('/api/salud', crearRutasSalud({ db }));
  app.use('/api', crearVerificarOrigen(config));
  app.use('/api', crearMiddlewareSesion({ db, config }));

  // Antes de express.json(): el cuerpo debe llegar intacto al servicio de almacenamiento.
  app.use('/api/subidas', requiereSesion, crearRutasSubidas(servicios));

  app.use(express.json());
  app.use('/api/auth', crearRutasAuth({ authService: servicios.auth, requiereSesion, config }));
  app.use('/api/cuenta', requiereSesion, crearRutasCuenta({ cuenta: servicios.cuenta, config }));
  app.use('/api/nodos', requiereSesion, crearRutasNodos(servicios));
  app.use('/api/favoritos', requiereSesion, crearRutasFavoritos(servicios));
  app.use('/api/papelera', requiereSesion, crearRutasPapelera(servicios));
  app.use('/api/espacios', requiereSesion, crearRutasEspacios(servicios));
  app.use('/api/invitaciones', requiereSesion, crearRutasInvitaciones(servicios));
  app.use('/api/propuestas', requiereSesion, crearRutasPropuestas(servicios));
  app.use('/api/avisos', requiereSesion, crearRutasAvisos(servicios));
  app.use('/api/colores', requiereSesion, crearRutasColores(servicios));

  app.use('/api', rutaApiNoEncontrada);
  const frontend = crearRutasFrontend(config.rutaFrontend);
  if (frontend) app.use(frontend);
  app.use(manejarErrores);
  return app;
}
