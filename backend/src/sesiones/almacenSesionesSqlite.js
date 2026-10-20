import session from 'express-session';

const UN_DIA_MS = 24 * 60 * 60 * 1000;

export class AlmacenSesionesSqlite extends session.Store {
  constructor(db, { limpiezaCadaMs = 15 * 60 * 1000 } = {}) {
    super();
    this.consultas = {
      obtener: db.prepare('SELECT datos FROM sesiones WHERE id = ? AND expira_en > ?'),
      guardar: db.prepare(`
        INSERT INTO sesiones (id, datos, expira_en, usuario_id, ultimo_uso) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (id) DO UPDATE SET
          datos = excluded.datos,
          expira_en = excluded.expira_en,
          usuario_id = excluded.usuario_id,
          ultimo_uso = excluded.ultimo_uso
      `),
      eliminar: db.prepare('DELETE FROM sesiones WHERE id = ?'),
      renovar: db.prepare('UPDATE sesiones SET expira_en = ?, ultimo_uso = ? WHERE id = ?'),
      purgar: db.prepare('DELETE FROM sesiones WHERE expira_en <= ?'),
    };
    this.temporizador = setInterval(() => this.purgarExpiradas(), limpiezaCadaMs);
    this.temporizador.unref();
  }

  get(id, listo) {
    responder(listo, () => {
      const fila = this.consultas.obtener.get(id, Date.now());
      return fila ? JSON.parse(fila.datos) : null;
    });
  }

  set(id, sesion, listo) {
    responder(listo, () => {
      this.consultas.guardar.run(id, JSON.stringify(sesion), expiracion(sesion), sesion.usuarioId ?? null, Date.now());
    });
  }

  destroy(id, listo) {
    responder(listo, () => {
      this.consultas.eliminar.run(id);
    });
  }

  touch(id, sesion, listo) {
    responder(listo, () => {
      this.consultas.renovar.run(expiracion(sesion), Date.now(), id);
    });
  }

  purgarExpiradas() {
    return this.consultas.purgar.run(Date.now()).changes;
  }
}

function expiracion(sesion) {
  const expira = sesion?.cookie?.expires;
  return expira ? new Date(expira).getTime() : Date.now() + UN_DIA_MS;
}

function responder(listo, operacion) {
  let resultado;
  try {
    resultado = operacion();
  } catch (error) {
    listo?.(error);
    return;
  }
  listo?.(null, resultado);
}
