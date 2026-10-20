import { Router } from 'express';

export function crearRutasColores({ colores }) {
  const router = Router();
  router.get('/', (req, res) => {
    res.json({ predeterminados: colores.predeterminados() });
  });
  return router;
}
