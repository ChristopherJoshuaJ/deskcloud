import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';

// Sirve la aplicación Angular compilada desde el mismo servidor que la API. Cualquier ruta que no
// sea un archivo ni de /api devuelve index.html, para que el enrutador de Angular la resuelva.
// Si todavía no se compiló el frontend no hace nada.
export function crearRutasFrontend(rutaFrontend) {
  const index = rutaFrontend ? path.join(rutaFrontend, 'index.html') : null;
  if (!index || !existsSync(index)) return null;

  const router = express.Router();
  router.use(express.static(rutaFrontend, { index: false }));
  router.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    res.set('Cache-Control', 'no-cache');
    res.sendFile(index);
  });
  return router;
}
