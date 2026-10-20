import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function abrirBaseDatos(ruta) {
  if (ruta !== ':memory:') {
    fs.mkdirSync(path.dirname(ruta), { recursive: true });
  }
  const db = new DatabaseSync(ruta);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  return db;
}

// La conexión es compartida por todas las peticiones: dentro de la operación
// no puede haber await, o sentencias de otras peticiones entrarían en la transacción.
export function enTransaccion(db, operacion) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const resultado = operacion();
    if (resultado instanceof Promise) {
      throw new Error('La operación de una transacción debe ser síncrona');
    }
    db.exec('COMMIT');
    return resultado;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
