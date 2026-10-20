import { config } from '../src/config.js';
import { abrirBaseDatos, migrar, versionEsquema } from '../src/db/index.js';

const db = abrirBaseDatos(config.rutaBaseDatos);
const aplicadas = migrar(db);

if (aplicadas.length === 0) {
  console.log(`La base de datos ya está al día (esquema v${versionEsquema(db)}): ${config.rutaBaseDatos}`);
} else {
  console.log(`Migraciones aplicadas: ${aplicadas.join(', ')}`);
  console.log(`Base de datos lista (esquema v${versionEsquema(db)}): ${config.rutaBaseDatos}`);
}
db.close();
