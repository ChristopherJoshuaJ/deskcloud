const COLUMNAS = `
  e.id,
  e.tipo,
  e.propietario_id   AS propietarioId,
  e.administrador_id AS administradorId,
  e.creado_en        AS creadoEn,
  r.id               AS raizId,
  r.nombre           AS nombre
`;

const DESDE = 'FROM espacios e JOIN nodos r ON r.espacio_id = e.id AND r.es_raiz = 1';

export function crearEspaciosRepository(db) {
  const consultas = {
    insertarPersonal: db.prepare(`INSERT INTO espacios (tipo, propietario_id) VALUES ('PERSONAL', ?)`),
    insertarCompartido: db.prepare(`INSERT INTO espacios (tipo, administrador_id) VALUES ('COMPARTIDO', ?)`),
    porId: db.prepare(`SELECT ${COLUMNAS} ${DESDE} WHERE e.id = ?`),
    personalDe: db.prepare(`SELECT ${COLUMNAS} ${DESDE} WHERE e.tipo = 'PERSONAL' AND e.propietario_id = ?`),
    compartidosDe: db.prepare(`
      SELECT ${COLUMNAS},
             (SELECT COUNT(*) FROM miembros m2 WHERE m2.espacio_id = e.id) AS totalMiembros,
             (SELECT u.nombre FROM usuarios u WHERE u.id = e.administrador_id) AS administradorNombre
      ${DESDE}
      JOIN miembros m ON m.espacio_id = e.id AND m.usuario_id = ?
      ORDER BY r.nombre COLLATE NOCASE
    `),
    eliminar: db.prepare('DELETE FROM espacios WHERE id = ?'),
    cambiarAdministrador: db.prepare('UPDATE espacios SET administrador_id = ? WHERE id = ?'),

    miembros: db.prepare(`
      SELECT u.id, u.nombre, u.correo, m.unido_en AS unidoEn
      FROM miembros m JOIN usuarios u ON u.id = m.usuario_id
      WHERE m.espacio_id = ?
      ORDER BY m.unido_en, u.id
    `),
    idsMiembros: db.prepare('SELECT usuario_id AS id FROM miembros WHERE espacio_id = ?'),
    esMiembro: db.prepare('SELECT 1 AS si FROM miembros WHERE espacio_id = ? AND usuario_id = ?'),
    agregarMiembro: db.prepare('INSERT INTO miembros (espacio_id, usuario_id) VALUES (?, ?)'),
    quitarMiembro: db.prepare('DELETE FROM miembros WHERE espacio_id = ? AND usuario_id = ?'),
    espaciosCompartidosDe: db.prepare('SELECT espacio_id AS id FROM miembros WHERE usuario_id = ?'),

    insertarInvitacion: db.prepare('INSERT INTO invitaciones (espacio_id, invitado_id, invitado_por) VALUES (?, ?, ?)'),
    invitacion: db.prepare(`
      SELECT i.id, i.espacio_id AS espacioId, i.invitado_id AS invitadoId, i.invitado_por AS invitadoPorId,
             i.creado_en AS creadoEn
      FROM invitaciones i WHERE i.id = ?
    `),
    invitacionDe: db.prepare('SELECT id FROM invitaciones WHERE espacio_id = ? AND invitado_id = ?'),
    invitacionesDeEspacio: db.prepare(`
      SELECT i.id, i.creado_en AS creadoEn,
             u.id AS invitadoId, u.nombre AS invitadoNombre, u.correo AS invitadoCorreo,
             p.id AS invitadoPorId, p.nombre AS invitadoPorNombre
      FROM invitaciones i
      JOIN usuarios u ON u.id = i.invitado_id
      LEFT JOIN usuarios p ON p.id = i.invitado_por
      WHERE i.espacio_id = ?
      ORDER BY i.id
    `),
    invitacionesDeUsuario: db.prepare(`
      SELECT i.id, i.creado_en AS creadoEn, i.espacio_id AS espacioId, r.nombre AS espacioNombre,
             p.id AS invitadoPorId, p.nombre AS invitadoPorNombre,
             (SELECT COUNT(*) FROM miembros m WHERE m.espacio_id = i.espacio_id) AS totalMiembros
      FROM invitaciones i
      JOIN nodos r ON r.espacio_id = i.espacio_id AND r.es_raiz = 1
      LEFT JOIN usuarios p ON p.id = i.invitado_por
      WHERE i.invitado_id = ?
      ORDER BY i.id DESC
    `),
    eliminarInvitacion: db.prepare('DELETE FROM invitaciones WHERE id = ?'),
  };

  return {
    crearPersonal(usuarioId) {
      return Number(consultas.insertarPersonal.run(usuarioId).lastInsertRowid);
    },
    crearCompartido(administradorId) {
      return Number(consultas.insertarCompartido.run(administradorId).lastInsertRowid);
    },
    obtener(id) {
      return consultas.porId.get(id);
    },
    personalDe(usuarioId) {
      return consultas.personalDe.get(usuarioId);
    },
    compartidosDe(usuarioId) {
      return consultas.compartidosDe.all(usuarioId);
    },
    eliminar(id) {
      consultas.eliminar.run(id);
    },
    cambiarAdministrador(espacioId, usuarioId) {
      consultas.cambiarAdministrador.run(usuarioId, espacioId);
    },

    // Del miembro más antiguo al más reciente.
    miembros(espacioId) {
      return consultas.miembros.all(espacioId);
    },
    idsMiembros(espacioId) {
      return consultas.idsMiembros.all(espacioId).map((fila) => fila.id);
    },
    esMiembro(espacioId, usuarioId) {
      return consultas.esMiembro.get(espacioId, usuarioId) !== undefined;
    },
    agregarMiembro(espacioId, usuarioId) {
      consultas.agregarMiembro.run(espacioId, usuarioId);
    },
    quitarMiembro(espacioId, usuarioId) {
      return consultas.quitarMiembro.run(espacioId, usuarioId).changes === 1;
    },
    idsEspaciosCompartidosDe(usuarioId) {
      return consultas.espaciosCompartidosDe.all(usuarioId).map((fila) => fila.id);
    },

    crearInvitacion(espacioId, invitadoId, invitadoPor) {
      return Number(consultas.insertarInvitacion.run(espacioId, invitadoId, invitadoPor).lastInsertRowid);
    },
    obtenerInvitacion(id) {
      return consultas.invitacion.get(id);
    },
    existeInvitacion(espacioId, invitadoId) {
      return consultas.invitacionDe.get(espacioId, invitadoId) !== undefined;
    },
    invitacionesDeEspacio(espacioId) {
      return consultas.invitacionesDeEspacio.all(espacioId);
    },
    invitacionesDeUsuario(usuarioId) {
      return consultas.invitacionesDeUsuario.all(usuarioId);
    },
    eliminarInvitacion(id) {
      consultas.eliminarInvitacion.run(id);
    },
  };
}
