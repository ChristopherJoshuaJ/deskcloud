import { NOMBRE_COOKIE, destruirSesion, opcionesCookie } from '../sesiones/index.js';

export function crearCuentaController({ cuenta, config }) {
  return {
    cambiarNombre(req, res) {
      res.json({ usuario: cuenta.cambiarNombre(req.usuario, req.body) });
    },
    async cambiarContrasena(req, res) {
      res.json(await cuenta.cambiarContrasena(req.usuario, req.body, req.sessionID));
    },
    async eliminar(req, res) {
      await cuenta.eliminarCuenta(req.usuario, req.body);
      await destruirSesion(req);
      res.clearCookie(NOMBRE_COOKIE, opcionesCookie(config));
      res.status(204).end();
    },
    sesiones(req, res) {
      res.json({ sesiones: cuenta.listarSesiones(req.usuario, req.sessionID) });
    },
    cerrarSesion(req, res) {
      res.json({ sesiones: cuenta.cerrarSesion(req.usuario, req.params.id, req.sessionID) });
    },
    cerrarOtras(req, res) {
      res.json(cuenta.cerrarOtras(req.usuario, req.sessionID));
    },
    espacioUsado(req, res) {
      res.json(cuenta.espacioUsado(req.usuario));
    },
  };
}
