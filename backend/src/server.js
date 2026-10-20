import { crearApp } from './app.js';
import { config } from './config.js';
import { inicializarBaseDatos } from './db/index.js';
import { crearServicios } from './servicios.js';
import { iniciarTareasPeriodicas } from './tareas.js';

const db = inicializarBaseDatos(config.rutaBaseDatos);
const servicios = crearServicios(db, config);

const descartadas = servicios.almacenamiento.limpiarPendientes() + servicios.explorador.limpiarArchivosSinContenido();
if (descartadas > 0) {
  console.log(`Se descartaron ${descartadas} subidas incompletas`);
}

const detenerTareas = iniciarTareasPeriodicas(servicios);

const app = crearApp({ db, servicios, config });
const servidor = app.listen(config.puerto, () => {
  console.log(`DeskCloud backend en http://localhost:${config.puerto}`);
  console.log(`Base de datos: ${config.rutaBaseDatos}`);
});

function cerrar() {
  detenerTareas();
  servidor.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', cerrar);
process.on('SIGTERM', cerrar);
