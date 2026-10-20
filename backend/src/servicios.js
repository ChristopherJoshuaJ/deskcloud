import { crearAlmacenamientoService } from './services/almacenamientoService.js';
import { crearAuthService } from './services/authService.js';
import { crearAutorizacionService } from './services/autorizacionService.js';
import { crearAvisosService } from './services/avisosService.js';
import { crearColoresService } from './services/coloresService.js';
import { crearCompartidosService } from './services/compartidosService.js';
import { crearContenidoService } from './services/contenidoService.js';
import { crearCuentaService } from './services/cuentaService.js';
import { crearEspacioService } from './services/espacioService.js';
import { crearExploradorService } from './services/exploradorService.js';
import { crearFavoritosService } from './services/favoritosService.js';
import { crearPapeleraService } from './services/papeleraService.js';
import { crearPropuestasService } from './services/propuestasService.js';
import { crearSeguimientoService } from './services/seguimientoService.js';
import { crearSubidasService } from './services/subidasService.js';
import { crearTextoService } from './services/textoService.js';
import { crearVersionesService } from './services/versionesService.js';

export function crearServicios(db, config) {
  const espacio = crearEspacioService(db);
  const autorizacion = crearAutorizacionService(db);
  const seguimiento = crearSeguimientoService(db);
  const almacenamiento = crearAlmacenamientoService(db, { tamanoFragmento: config.tamanoFragmento });
  const dependencias = { autorizacion, almacenamiento, seguimiento };
  const papelera = crearPapeleraService(db, { autorizacion, espacioService: espacio });
  const propuestas = crearPropuestasService(db, { autorizacion, seguimiento, papelera });
  const compartidos = crearCompartidosService(db, { autorizacion, seguimiento, papelera, propuestas });
  const auth = crearAuthService(db, { espacioService: espacio });
  return {
    espacio,
    autorizacion,
    seguimiento,
    almacenamiento,
    auth,
    cuenta: crearCuentaService(db, { auth, compartidos }),
    explorador: crearExploradorService(db, dependencias),
    subidas: crearSubidasService(db, dependencias),
    contenido: crearContenidoService(db, dependencias),
    favoritos: crearFavoritosService(db, dependencias),
    papelera,
    versiones: crearVersionesService(db, dependencias),
    texto: crearTextoService(db, dependencias),
    colores: crearColoresService(db, dependencias),
    propuestas,
    compartidos,
    avisos: crearAvisosService(db, { propuestas }),
  };
}
