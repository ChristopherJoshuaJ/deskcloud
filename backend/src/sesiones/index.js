import { randomBytes } from 'node:crypto';
import session from 'express-session';
import { AlmacenSesionesSqlite } from './almacenSesionesSqlite.js';

export const NOMBRE_COOKIE = 'deskcloud.sid';

export function opcionesCookie(config) {
  return { httpOnly: true, sameSite: 'lax', secure: config.cookieSegura, path: '/' };
}

export function crearMiddlewareSesion({ db, config }) {
  return session({
    name: NOMBRE_COOKIE,
    secret: config.secretoSesion || obtenerSecretoGuardado(db),
    store: new AlmacenSesionesSqlite(db),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: { ...opcionesCookie(config), maxAge: config.duracionSesionMs },
  });
}

// Sin SECRETO_SESION se genera uno y se guarda en la base, para que las sesiones
// sigan siendo válidas después de reiniciar el servidor.
function obtenerSecretoGuardado(db) {
  const guardado = db.prepare(`SELECT valor FROM ajustes WHERE clave = 'secreto_sesion'`).get();
  if (guardado) {
    return guardado.valor;
  }
  const secreto = randomBytes(32).toString('hex');
  db.prepare(`INSERT INTO ajustes (clave, valor) VALUES ('secreto_sesion', ?)`).run(secreto);
  return secreto;
}

export function regenerarSesion(req) {
  return new Promise((resolver, rechazar) => {
    req.session.regenerate((error) => (error ? rechazar(error) : resolver()));
  });
}

export function destruirSesion(req) {
  return new Promise((resolver, rechazar) => {
    if (!req.session) {
      resolver();
      return;
    }
    req.session.destroy((error) => (error ? rechazar(error) : resolver()));
  });
}
