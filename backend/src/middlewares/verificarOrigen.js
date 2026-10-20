import { OrigenNoPermitido } from '../errores.js';

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Defensa contra CSRF además de la cookie SameSite: las peticiones que cambian datos deben venir
// de la propia aplicación o de un origen configurado (por ejemplo, el servidor de desarrollo de Angular).
// Los clientes que no son navegadores no envían Origin ni Sec-Fetch-Site y se dejan pasar.
export function crearVerificarOrigen({ origenesPermitidos = [] } = {}) {
  const permitidos = new Set(origenesPermitidos);
  return function verificarOrigen(req, res, next) {
    if (METODOS_SEGUROS.has(req.method)) return next();
    const origen = req.get('origin');
    if (origen) {
      if (origen === `${req.protocol}://${req.get('host')}` || permitidos.has(origen)) return next();
      throw new OrigenNoPermitido();
    }
    if (req.get('sec-fetch-site') === 'cross-site') {
      throw new OrigenNoPermitido();
    }
    next();
  };
}
