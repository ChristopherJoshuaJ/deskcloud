import { CredencialesInvalidas, DemasiadosIntentos } from '../errores.js';
import { crearLimiteIntentos } from '../seguridad/limiteIntentos.js';
import { NOMBRE_COOKIE, destruirSesion, opcionesCookie, regenerarSesion } from '../sesiones/index.js';

const LONGITUD_MAXIMA_NAVEGADOR = 300;
const VENTANA_INTENTOS_MS = 15 * 60 * 1000;

export function crearAuthController({ authService, config }) {
  // Por cuenta frena a quien prueba contraseñas para un correo; por IP, a quien prueba muchos correos.
  const intentosPorCuenta = crearLimiteIntentos({ maximo: 5, ventanaMs: VENTANA_INTENTOS_MS });
  const intentosPorIp = crearLimiteIntentos({ maximo: 20, ventanaMs: VENTANA_INTENTOS_MS });

  // Se cambia el identificador de sesión al autenticarse para evitar la fijación de sesión.
  async function abrirSesion(req, usuario) {
    await regenerarSesion(req);
    req.session.usuarioId = usuario.id;
    req.session.navegador = (req.get('user-agent') ?? '').slice(0, LONGITUD_MAXIMA_NAVEGADOR) || null;
    req.session.creadaEn = new Date().toISOString();
  }

  return {
    async registro(req, res) {
      const usuario = await authService.registrar(req.body);
      await abrirSesion(req, usuario);
      res.status(201).json({ usuario });
    },

    async login(req, res) {
      const correo = typeof req.body?.correo === 'string' ? req.body.correo.trim().toLowerCase() : '';
      const claveCuenta = `${req.ip}|${correo}`;
      const espera = Math.max(intentosPorCuenta.espera(claveCuenta), intentosPorIp.espera(req.ip));
      if (espera > 0) {
        res.set('Retry-After', String(espera));
        throw new DemasiadosIntentos(espera);
      }
      let usuario;
      try {
        usuario = await authService.iniciarSesion(req.body);
      } catch (error) {
        if (error instanceof CredencialesInvalidas) {
          intentosPorCuenta.fallo(claveCuenta);
          intentosPorIp.fallo(req.ip);
        }
        throw error;
      }
      intentosPorCuenta.limpiar(claveCuenta);
      await abrirSesion(req, usuario);
      res.json({ usuario });
    },

    async logout(req, res) {
      await destruirSesion(req);
      res.clearCookie(NOMBRE_COOKIE, opcionesCookie(config));
      res.status(204).end();
    },

    me(req, res) {
      res.json({ usuario: req.usuario });
    },
  };
}
