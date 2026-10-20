const COLUMNAS = `
  id,
  nodo_id          AS nodoId,
  numero,
  estado,
  tamano,
  tamano_fragmento AS tamanoFragmento,
  total_fragmentos AS totalFragmentos,
  mime,
  sha256,
  restaurada_de    AS restauradaDe,
  creado_por       AS creadoPor,
  creado_en        AS creadoEn
`;

export function crearVersionesRepository(db) {
  const insertarPendiente = db.prepare(`
    INSERT INTO versiones (nodo_id, tamano_fragmento, mime, creado_por)
    VALUES (:nodoId, :tamanoFragmento, :mime, :creadoPor)
  `);
  const siguienteNumero = db.prepare(`
    SELECT COALESCE(MAX(numero), 0) + 1 AS numero FROM versiones WHERE nodo_id = ?
  `);
  const completar = db.prepare(`
    UPDATE versiones
    SET estado = 'COMPLETA',
        numero = :numero,
        tamano = :tamano,
        total_fragmentos = :totalFragmentos,
        sha256 = :sha256
    WHERE id = :id AND estado = 'PENDIENTE'
  `);
  const porId = db.prepare(`SELECT ${COLUMNAS} FROM versiones WHERE id = ?`);
  const historial = db.prepare(`
    SELECT
      v.id,
      v.numero,
      v.tamano,
      v.mime,
      v.sha256,
      v.restaurada_de AS restauradaDe,
      v.creado_en     AS creadoEn,
      u.id            AS autorId,
      u.nombre        AS autorNombre
    FROM versiones v
    LEFT JOIN usuarios u ON u.id = v.creado_por
    WHERE v.nodo_id = ? AND v.estado = 'COMPLETA'
    ORDER BY v.numero DESC
  `);
  const insertarCopia = db.prepare(`
    INSERT INTO versiones
      (nodo_id, numero, estado, tamano, tamano_fragmento, total_fragmentos, mime, sha256, restaurada_de, creado_por)
    VALUES
      (:nodoId, :numero, 'COMPLETA', :tamano, :tamanoFragmento, :totalFragmentos, :mime, :sha256, :restauradaDe, :creadoPor)
  `);
  const eliminar = db.prepare('DELETE FROM versiones WHERE id = ?');
  const eliminarPendientes = db.prepare(`DELETE FROM versiones WHERE estado = 'PENDIENTE'`);

  return {
    crearPendiente({ nodoId, tamanoFragmento, mime, creadoPor }) {
      return Number(insertarPendiente.run({ nodoId, tamanoFragmento, mime, creadoPor }).lastInsertRowid);
    },
    siguienteNumero(nodoId) {
      return siguienteNumero.get(nodoId).numero;
    },
    completar({ id, numero, tamano, totalFragmentos, sha256 }) {
      return completar.run({ id, numero, tamano, totalFragmentos, sha256 }).changes === 1;
    },
    obtenerPorId(id) {
      return porId.get(id);
    },
    // Versiones completas de un archivo, de la más reciente a la más antigua, con su autor.
    historial(nodoId) {
      return historial.all(nodoId);
    },
    // Sin numero, la copia es la versión 1 de otro archivo y no hereda el historial del original.
    insertarCopia(origen, { nodoId, numero = 1, restauradaDe = null, creadoPor }) {
      const { tamano, tamanoFragmento, totalFragmentos, mime, sha256 } = origen;
      const resultado = insertarCopia.run({
        nodoId,
        numero,
        tamano,
        tamanoFragmento,
        totalFragmentos,
        mime,
        sha256,
        restauradaDe,
        creadoPor,
      });
      return Number(resultado.lastInsertRowid);
    },
    eliminar(id) {
      eliminar.run(id);
    },
    eliminarPendientes() {
      return eliminarPendientes.run().changes;
    },
  };
}
