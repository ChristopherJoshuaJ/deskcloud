import { abrirBaseDatos } from './conexion.js';
import { migrar } from './migrar.js';

export { abrirBaseDatos, enTransaccion } from './conexion.js';
export { migrar, versionEsquema } from './migrar.js';

export function inicializarBaseDatos(ruta) {
  const db = abrirBaseDatos(ruta);
  migrar(db);
  return db;
}
