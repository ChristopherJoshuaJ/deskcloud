export function crearSesionesRepository(db) {
  const consultas = {
    deUsuario: db.prepare(`
      SELECT id,
             json_extract(datos, '$.navegador') AS navegador,
             json_extract(datos, '$.creadaEn')  AS creadaEn,
             ultimo_uso                         AS ultimoUso
      FROM sesiones
      WHERE usuario_id = ? AND expira_en > ?
      ORDER BY ultimo_uso DESC
    `),
    eliminar: db.prepare('DELETE FROM sesiones WHERE id = ? AND usuario_id = ?'),
    eliminarOtras: db.prepare('DELETE FROM sesiones WHERE usuario_id = ? AND id <> ?'),
  };

  return {
    deUsuario(usuarioId) {
      return consultas.deUsuario.all(usuarioId, Date.now());
    },
    eliminar(id, usuarioId) {
      return consultas.eliminar.run(id, usuarioId).changes === 1;
    },
    eliminarOtras(usuarioId, sesionActualId) {
      return consultas.eliminarOtras.run(usuarioId, sesionActualId).changes;
    },
  };
}
