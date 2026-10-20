import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { enTransaccion } from './conexion.js';

const carpetaMigraciones = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migraciones');

export function versionEsquema(db) {
  return db.prepare('PRAGMA user_version').get().user_version;
}

// Las claves foráneas se desactivan mientras se migra porque reconstruir una tabla
// (crear la nueva, copiar, borrar la vieja) dispararía los ON DELETE CASCADE.
// Antes de confirmar cada migración se comprueba que no quedó ninguna referencia rota.
export function migrar(db) {
  const actual = versionEsquema(db);
  const archivos = fs
    .readdirSync(carpetaMigraciones)
    .filter((nombre) => /^\d+_.+\.sql$/.test(nombre))
    .sort();

  const clavesActivas = db.prepare('PRAGMA foreign_keys').get().foreign_keys === 1;
  db.exec('PRAGMA foreign_keys = OFF');
  const aplicadas = [];
  try {
    for (const archivo of archivos) {
      const numero = Number.parseInt(archivo, 10);
      if (numero <= actual) continue;

      const sql = fs.readFileSync(path.join(carpetaMigraciones, archivo), 'utf8');
      enTransaccion(db, () => {
        db.exec(sql);
        const rotas = db.prepare('PRAGMA foreign_key_check').all();
        if (rotas.length > 0) {
          throw new Error(`La migración ${archivo} deja ${rotas.length} referencias rotas (tabla ${rotas[0].table})`);
        }
        db.exec(`PRAGMA user_version = ${numero}`);
      });
      aplicadas.push(archivo);
    }
  } finally {
    if (clavesActivas) db.exec('PRAGMA foreign_keys = ON');
  }
  return aplicadas;
}
