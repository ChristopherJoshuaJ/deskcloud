export function crearAvisosRepository(db) {
  const insertar = db.prepare(`
    INSERT INTO avisos (usuario_id, tipo, espacio_id, datos) VALUES (:usuarioId, :tipo, :espacioId, :datos)
  `);
  const listar = db.prepare(`
    SELECT id, tipo, espacio_id AS espacioId, datos, leido, creado_en AS creadoEn
    FROM avisos
    WHERE usuario_id = :usuarioId AND (:antesDe IS NULL OR id < :antesDe)
    ORDER BY id DESC
    LIMIT :limite
  `);
  const noLeidos = db.prepare('SELECT COUNT(*) AS total FROM avisos WHERE usuario_id = ? AND leido = 0');
  const marcarTodos = db.prepare('UPDATE avisos SET leido = 1 WHERE usuario_id = ? AND leido = 0');
  const marcarUno = db.prepare('UPDATE avisos SET leido = 1 WHERE usuario_id = ? AND id = ?');

  return {
    crear({ usuarioIds, tipo, espacioId = null, datos = {} }) {
      const texto = JSON.stringify(datos);
      for (const usuarioId of usuarioIds) insertar.run({ usuarioId, tipo, espacioId, datos: texto });
    },
    listar(usuarioId, { antesDe = null, limite }) {
      return listar.all({ usuarioId, antesDe, limite });
    },
    noLeidos(usuarioId) {
      return noLeidos.get(usuarioId).total;
    },
    marcarLeidos(usuarioId, ids = null) {
      if (ids === null) {
        marcarTodos.run(usuarioId);
      } else {
        for (const id of ids) marcarUno.run(usuarioId, id);
      }
    },
  };
}
