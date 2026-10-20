const SUBARBOL = `
  WITH RECURSIVE sub (id) AS (
    SELECT :nodoId
    UNION ALL
    SELECT n.id FROM nodos n JOIN sub ON n.padre_id = sub.id
  )
`;

export function crearSinVerRepository(db) {
  const consultas = {
    marcar: db.prepare(`
      INSERT INTO sin_ver (usuario_id, nodo_id) VALUES (?, ?)
      ON CONFLICT (usuario_id, nodo_id) DO UPDATE SET cambiado_en = excluded.cambiado_en
    `),
    visto: db.prepare('DELETE FROM sin_ver WHERE usuario_id = ? AND nodo_id = ?'),
    subarbolVisto: db.prepare(`${SUBARBOL} DELETE FROM sin_ver WHERE usuario_id = :usuarioId AND nodo_id IN (SELECT id FROM sub)`),
    quitarSubarbol: db.prepare(`${SUBARBOL} DELETE FROM sin_ver WHERE nodo_id IN (SELECT id FROM sub)`),
    quitarDeUsuarioEnEspacio: db.prepare(`
      DELETE FROM sin_ver
      WHERE usuario_id = ? AND nodo_id IN (SELECT id FROM nodos WHERE espacio_id = ?)
    `),
    // Los elementos sin ver y todas las carpetas que los contienen.
    conCambios: db.prepare(`
      WITH RECURSIVE arriba (id) AS (
        SELECT nodo_id FROM sin_ver WHERE usuario_id = ?
        UNION
        SELECT n.padre_id FROM nodos n JOIN arriba a ON n.id = a.id WHERE n.padre_id IS NOT NULL
      )
      SELECT id FROM arriba
    `),
  };

  return {
    marcar(nodoIds, usuarioIds) {
      for (const usuarioId of usuarioIds) {
        for (const nodoId of nodoIds) consultas.marcar.run(usuarioId, nodoId);
      }
    },
    marcarVisto(usuarioId, nodoId) {
      consultas.visto.run(usuarioId, nodoId);
    },
    marcarSubarbolVisto(usuarioId, nodoId) {
      consultas.subarbolVisto.run({ usuarioId, nodoId });
    },
    quitarSubarbol(nodoId) {
      consultas.quitarSubarbol.run({ nodoId });
    },
    quitarDeUsuarioEnEspacio(usuarioId, espacioId) {
      consultas.quitarDeUsuarioEnEspacio.run(usuarioId, espacioId);
    },
    idsConCambios(usuarioId) {
      return new Set(consultas.conCambios.all(usuarioId).map((fila) => fila.id));
    },
  };
}
