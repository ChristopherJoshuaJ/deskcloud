export function crearFragmentosRepository(db) {
  const insertar = db.prepare('INSERT INTO fragmentos (version_id, indice, datos) VALUES (?, ?, ?)');
  const obtener = db.prepare('SELECT datos FROM fragmentos WHERE version_id = ? AND indice = ?');
  const copiar = db.prepare(`
    INSERT INTO fragmentos (version_id, indice, datos)
    SELECT ?, indice, datos FROM fragmentos WHERE version_id = ?
  `);

  return {
    insertar(versionId, indice, datos) {
      insertar.run(versionId, indice, datos);
    },
    obtener(versionId, indice) {
      return obtener.get(versionId, indice)?.datos;
    },
    copiar(origenVersionId, destinoVersionId) {
      copiar.run(destinoVersionId, origenVersionId);
    },
  };
}
