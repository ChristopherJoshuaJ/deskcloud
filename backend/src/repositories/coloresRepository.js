export function crearColoresRepository(db) {
  const consultas = {
    establecer: db.prepare(`
      INSERT INTO colores_personales (usuario_id, nodo_id, color) VALUES (?, ?, ?)
      ON CONFLICT (usuario_id, nodo_id) DO UPDATE SET color = excluded.color
    `),
    quitar: db.prepare('DELETE FROM colores_personales WHERE usuario_id = ? AND nodo_id = ?'),
    quitarDeNodo: db.prepare('DELETE FROM colores_personales WHERE nodo_id = ?'),
    quitarDeUsuarioEnEspacio: db.prepare(`
      DELETE FROM colores_personales
      WHERE usuario_id = ? AND nodo_id IN (SELECT id FROM nodos WHERE espacio_id = ?)
    `),
  };

  return {
    establecerPersonal(usuarioId, nodoId, color) {
      consultas.establecer.run(usuarioId, nodoId, color);
    },
    quitarPersonal(usuarioId, nodoId) {
      consultas.quitar.run(usuarioId, nodoId);
    },
    quitarPersonalesDe(nodoId) {
      consultas.quitarDeNodo.run(nodoId);
    },
    quitarDeUsuarioEnEspacio(usuarioId, espacioId) {
      consultas.quitarDeUsuarioEnEspacio.run(usuarioId, espacioId);
    },
  };
}
