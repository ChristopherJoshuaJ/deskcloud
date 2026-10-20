import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raizBackend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const config = {
  puerto: Number(process.env.PUERTO ?? 3000),
  rutaBaseDatos: process.env.RUTA_BD ?? path.join(raizBackend, 'data', 'deskcloud.db'),
  tamanoFragmento: Number(process.env.TAMANO_FRAGMENTO ?? 1024 * 1024),
  secretoSesion: process.env.SECRETO_SESION,
  cookieSegura: process.env.COOKIE_SEGURA === 'true',
  duracionSesionMs: Number(process.env.DURACION_SESION_MS ?? 7 * 24 * 60 * 60 * 1000),
  rutaFrontend: process.env.RUTA_FRONTEND ?? path.join(raizBackend, '..', 'frontend', 'dist', 'deskcloud', 'browser'),
  origenesPermitidos: (process.env.ORIGENES_PERMITIDOS ?? 'http://localhost:4200')
    .split(',')
    .map((origen) => origen.trim())
    .filter(Boolean),
};
