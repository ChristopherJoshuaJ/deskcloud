const AHORA = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;

const COLUMNAS = `
  p.id,
  p.espacio_id     AS espacioId,
  p.tipo,
  p.motivo,
  p.estado,
  p.creada_en      AS creadaEn,
  p.expira_en      AS expiraEn,
  p.cerrada_en     AS cerradaEn,
  p.propuesto_por  AS propuestoPorId,
  (SELECT u.nombre FROM usuarios u WHERE u.id = p.propuesto_por) AS propuestoPorNombre
`;

export function crearPropuestasRepository(db) {
  const consultas = {
    insertar: db.prepare(`
      INSERT INTO propuestas (espacio_id, tipo, propuesto_por, motivo, expira_en)
      VALUES (:espacioId, :tipo, :propuestoPor, :motivo, :expiraEn)
    `),
    insertarNodo: db.prepare('INSERT INTO propuesta_nodos (propuesta_id, nodo_id, nombre, tipo) VALUES (?, ?, ?, ?)'),
    insertarVoto: db.prepare('INSERT INTO votos (propuesta_id, usuario_id, voto, votado_en) VALUES (?, ?, ?, ?)'),
    porId: db.prepare(`SELECT ${COLUMNAS} FROM propuestas p WHERE p.id = ?`),
    deEspacio: db.prepare(`
      SELECT ${COLUMNAS} FROM propuestas p
      WHERE p.espacio_id = :espacioId AND ((:abiertas = 1 AND p.estado = 'ABIERTA') OR (:abiertas = 0 AND p.estado <> 'ABIERTA'))
      ORDER BY p.id DESC
      LIMIT :limite
    `),
    pendientesDe: db.prepare(`
      SELECT ${COLUMNAS} FROM propuestas p
      JOIN votos v ON v.propuesta_id = p.id AND v.usuario_id = ?
      WHERE p.estado = 'ABIERTA' AND v.voto IS NULL
      ORDER BY p.expira_en
    `),
    totalPendientesDe: db.prepare(`
      SELECT COUNT(*) AS total FROM propuestas p
      JOIN votos v ON v.propuesta_id = p.id AND v.usuario_id = ?
      WHERE p.estado = 'ABIERTA' AND v.voto IS NULL AND (? IS NULL OR p.espacio_id = ?)
    `),
    nodos: db.prepare(`
      SELECT pn.nodo_id AS nodoId, pn.nombre, pn.tipo FROM propuesta_nodos pn WHERE pn.propuesta_id = ? ORDER BY pn.id
    `),
    votos: db.prepare(`
      SELECT v.usuario_id AS usuarioId, u.nombre AS usuarioNombre, v.voto, v.votado_en AS votadoEn
      FROM votos v JOIN usuarios u ON u.id = v.usuario_id
      WHERE v.propuesta_id = ?
      ORDER BY u.nombre COLLATE NOCASE, u.id
    `),
    votar: db.prepare(`UPDATE votos SET voto = ?, votado_en = ${AHORA} WHERE propuesta_id = ? AND usuario_id = ?`),
    quitarVotosDe: db.prepare(`
      DELETE FROM votos
      WHERE usuario_id = ? AND propuesta_id IN (SELECT id FROM propuestas WHERE espacio_id = ? AND estado = 'ABIERTA')
    `),
    recuento: db.prepare(`SELECT COUNT(*) AS total, COALESCE(SUM(voto = 'SI'), 0) AS si FROM votos WHERE propuesta_id = ?`),
    cerrar: db.prepare(`UPDATE propuestas SET estado = ?, cerrada_en = ${AHORA} WHERE id = ? AND estado = 'ABIERTA'`),
    vencer: db.prepare(`
      UPDATE propuestas SET estado = 'VENCIDA', cerrada_en = ${AHORA}
      WHERE estado = 'ABIERTA' AND expira_en <= ${AHORA}
      RETURNING id
    `),
    porVencer: db.prepare(`
      UPDATE propuestas SET aviso_vencimiento = 1
      WHERE estado = 'ABIERTA' AND aviso_vencimiento = 0 AND expira_en <= ?
      RETURNING id
    `),
    abiertasDeEspacio: db.prepare(`SELECT id FROM propuestas WHERE espacio_id = ? AND estado = 'ABIERTA'`),
    // Nodos de la lista que ya están en otra propuesta abierta del mismo tipo.
    enPropuestaAbierta: db.prepare(`
      SELECT pn.nodo_id AS nodoId, pn.nombre FROM propuesta_nodos pn
      JOIN propuestas p ON p.id = pn.propuesta_id
      WHERE p.estado = 'ABIERTA' AND p.tipo = ? AND pn.nodo_id IN (SELECT value FROM json_each(?))
    `),
  };

  return {
    crear({ espacioId, tipo, propuestoPor, motivo, expiraEn, elementos, votantes }) {
      const id = Number(consultas.insertar.run({ espacioId, tipo, propuestoPor, motivo, expiraEn }).lastInsertRowid);
      for (const nodo of elementos) consultas.insertarNodo.run(id, nodo.id, nodo.nombre, nodo.tipo);
      for (const usuarioId of votantes) {
        const propio = usuarioId === propuestoPor;
        consultas.insertarVoto.run(id, usuarioId, propio ? 'SI' : null, propio ? new Date().toISOString() : null);
      }
      return id;
    },
    obtener(id) {
      return consultas.porId.get(id);
    },
    deEspacio(espacioId, { abiertas, limite }) {
      return consultas.deEspacio.all({ espacioId, abiertas: abiertas ? 1 : 0, limite });
    },
    pendientesDe(usuarioId) {
      return consultas.pendientesDe.all(usuarioId);
    },
    totalPendientesDe(usuarioId, espacioId = null) {
      return consultas.totalPendientesDe.get(usuarioId, espacioId, espacioId).total;
    },
    nodos(propuestaId) {
      return consultas.nodos.all(propuestaId);
    },
    votos(propuestaId) {
      return consultas.votos.all(propuestaId);
    },
    votar(propuestaId, usuarioId, voto) {
      return consultas.votar.run(voto, propuestaId, usuarioId).changes === 1;
    },
    quitarVotosDe(usuarioId, espacioId) {
      consultas.quitarVotosDe.run(usuarioId, espacioId);
    },
    recuento(propuestaId) {
      return consultas.recuento.get(propuestaId);
    },
    cerrar(propuestaId, estado) {
      return consultas.cerrar.run(estado, propuestaId).changes === 1;
    },
    vencer() {
      return consultas.vencer.all().map((fila) => fila.id);
    },
    marcarPorVencer(limite) {
      return consultas.porVencer.all(limite).map((fila) => fila.id);
    },
    idsAbiertasDeEspacio(espacioId) {
      return consultas.abiertasDeEspacio.all(espacioId).map((fila) => fila.id);
    },
    enPropuestaAbierta(tipo, nodoIds) {
      return consultas.enPropuestaAbierta.all(tipo, JSON.stringify(nodoIds));
    },
  };
}
