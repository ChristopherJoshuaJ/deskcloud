import { NoAutenticado } from '../errores.js';
import { destruirSesion } from '../sesiones/index.js';

export function crearRequiereSesion({ authService }) {
  return async function requiereSesion(req, res, next) {
    const usuarioId = req.session?.usuarioId;
    const usuario = usuarioId != null ? authService.obtenerUsuario(usuarioId) : null;
    if (!usuario) {
      if (usuarioId != null) {
        await destruirSesion(req);
      }
      throw new NoAutenticado();
    }
    req.usuario = usuario;
    next();
  };
}
