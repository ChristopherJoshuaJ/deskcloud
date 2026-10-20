import { COLUMNAS_ELEMENTO } from './nodosRepository.js';

export function crearFavoritosRepository(db) {
  const insertar = db.prepare('INSERT INTO favoritos (usuario_id, nodo_id, orden) VALUES (?, ?, ?)');
  const insertarAlFinal = db.prepare(`
    INSERT INTO favoritos (usuario_id, nodo_id, orden)
    VALUES (:usuarioId, :nodoId, (SELECT COALESCE(MAX(orden), -1) + 1 FROM favoritos WHERE usuario_id = :usuarioId))
    ON CONFLICT (usuario_id, nodo_id) DO NOTHING
  `);
  const listar = db.prepare(`
    SELECT ${COLUMNAS_ELEMENTO}, f.orden
    FROM favoritos f
    JOIN nodos n ON n.id = f.nodo_id
    LEFT JOIN versiones v ON v.id = n.version_actual_id
    WHERE f.usuario_id = :usuarioId
    ORDER BY f.orden, f.creado_en
  `);
  const ids = db.prepare('SELECT nodo_id AS nodoId FROM favoritos WHERE usuario_id = ?');
  const quitar = db.prepare('DELETE FROM favoritos WHERE usuario_id = ? AND nodo_id = ?');
  const cambiarOrden = db.prepare('UPDATE favoritos SET orden = ? WHERE usuario_id = ? AND nodo_id = ?');
  const quitarDeEspacio = db.prepare(`
    DELETE FROM favoritos WHERE usuario_id = ? AND nodo_id IN (SELECT id FROM nodos WHERE espacio_id = ?)
  `);

  return {
    agregar(usuarioId, nodoId, orden) {
      if (orden === undefined) {
        insertarAlFinal.run({ usuarioId, nodoId });
      } else {
        insertar.run(usuarioId, nodoId, orden);
      }
    },
    listar(usuarioId) {
      return listar.all({ usuarioId });
    },
    idsDe(usuarioId) {
      return ids.all(usuarioId).map((fila) => fila.nodoId);
    },
    quitar(usuarioId, nodoId) {
      quitar.run(usuarioId, nodoId);
    },
    cambiarOrden(usuarioId, nodoId, orden) {
      cambiarOrden.run(orden, usuarioId, nodoId);
    },
    quitarDeEspacio(usuarioId, espacioId) {
      quitarDeEspacio.run(usuarioId, espacioId);
    },
  };
}
