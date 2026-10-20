const COLUMNAS = `
  id,
  espacio_id        AS espacioId,
  (SELECT e.tipo FROM espacios e WHERE e.id = espacio_id) AS tipoEspacio,
  padre_id          AS padreId,
  tipo,
  nombre,
  es_raiz           AS esRaiz,
  version_actual_id AS versionActualId,
  en_papelera       AS enPapelera,
  padre_original_id AS padreOriginalId,
  eliminado_en      AS eliminadoEn,
  color,
  creado_por        AS creadoPor,
  creado_en         AS creadoEn,
  modificado_en     AS modificadoEn
`;

// Un archivo sin versión es una subida en curso: existe para reservar el nombre, pero no se muestra.
const VISIBLE = `(n.tipo = 'CARPETA' OR n.version_actual_id IS NOT NULL)`;

const AHORA = `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`;

// Requiere el parámetro :usuarioId y los alias n (nodos) y v (versiones).
export const COLUMNAS_ELEMENTO = `
  n.id,
  n.espacio_id    AS espacioId,
  (SELECT e.tipo FROM espacios e WHERE e.id = n.espacio_id) AS tipoEspacio,
  n.nombre,
  n.tipo,
  n.padre_id      AS padreId,
  n.es_raiz       AS esRaiz,
  n.creado_en     AS creadoEn,
  n.modificado_en AS modificadoEn,
  v.tamano,
  v.mime,
  v.numero        AS version,
  CASE WHEN n.tipo = 'CARPETA' THEN
    (SELECT COUNT(*) FROM nodos h
     WHERE h.padre_id = n.id AND (h.tipo = 'CARPETA' OR h.version_actual_id IS NOT NULL))
  END AS elementos,
  EXISTS (SELECT 1 FROM favoritos f WHERE f.nodo_id = n.id AND f.usuario_id = :usuarioId) AS esFavorito,
  n.color         AS colorGrupo,
  (SELECT cp.color FROM colores_personales cp WHERE cp.nodo_id = n.id AND cp.usuario_id = :usuarioId) AS colorPersonal,
  n.nota_color    AS notaColor,
  n.nota_color_en AS notaColorEn,
  n.nota_color_por AS notaColorPorId,
  (SELECT u.nombre FROM usuarios u WHERE u.id = n.nota_color_por) AS notaColorPorNombre,
  (SELECT p.id FROM propuesta_nodos pn JOIN propuestas p ON p.id = pn.propuesta_id
   WHERE pn.nodo_id = n.id AND p.estado = 'ABIERTA' AND p.expira_en > ${AHORA}
   ORDER BY p.id LIMIT 1) AS propuestaId,
  (SELECT p.tipo FROM propuesta_nodos pn JOIN propuestas p ON p.id = pn.propuesta_id
   WHERE pn.nodo_id = n.id AND p.estado = 'ABIERTA' AND p.expira_en > ${AHORA}
   ORDER BY p.id LIMIT 1) AS propuestaTipo
`;

export function crearNodosRepository(db) {
  const consultas = {
    insertar: db.prepare(`
      INSERT INTO nodos (espacio_id, padre_id, tipo, nombre, es_raiz, color, creado_por)
      VALUES (:espacioId, :padreId, :tipo, :nombre, :esRaiz, :color, :creadoPor)
    `),
    porId: db.prepare(`SELECT ${COLUMNAS} FROM nodos WHERE id = ?`),
    raizDe: db.prepare(`SELECT ${COLUMNAS} FROM nodos WHERE espacio_id = ? AND es_raiz = 1`),
    hijoPorNombre: db.prepare(`SELECT ${COLUMNAS} FROM nodos WHERE padre_id = ? AND nombre = ? COLLATE NOCASE`),
    nombresHijos: db.prepare('SELECT id, nombre, tipo FROM nodos WHERE padre_id = ?'),
    hijosVisibles: db.prepare(`SELECT ${COLUMNAS} FROM nodos n WHERE n.padre_id = ? AND ${VISIBLE}`),
    cadena: db.prepare(`
      WITH RECURSIVE cadena (id, nivel) AS (
        SELECT id, 0 FROM nodos WHERE id = ?
        UNION ALL
        SELECT n.padre_id, c.nivel + 1 FROM nodos n JOIN cadena c ON n.id = c.id WHERE n.padre_id IS NOT NULL
      )
      SELECT ${COLUMNAS} FROM cadena JOIN nodos USING (id) ORDER BY nivel DESC
    `),
    elemento: db.prepare(`
      SELECT ${COLUMNAS_ELEMENTO}
      FROM nodos n LEFT JOIN versiones v ON v.id = n.version_actual_id
      WHERE n.id = :id
    `),
    contenido: db.prepare(`
      SELECT ${COLUMNAS_ELEMENTO}
      FROM nodos n LEFT JOIN versiones v ON v.id = n.version_actual_id
      WHERE n.padre_id = :padreId AND ${VISIBLE}
      ORDER BY n.tipo = 'ARCHIVO', n.nombre COLLATE NOCASE
    `),
    subcarpetas: db.prepare(`
      SELECT ${COLUMNAS_ELEMENTO},
             EXISTS (SELECT 1 FROM nodos h WHERE h.padre_id = n.id AND h.tipo = 'CARPETA') AS tieneSubcarpetas
      FROM nodos n LEFT JOIN versiones v ON v.id = n.version_actual_id
      WHERE n.padre_id = :padreId AND n.tipo = 'CARPETA'
      ORDER BY n.nombre COLLATE NOCASE
    `),
    buscar: db.prepare(`
      WITH RECURSIVE sub (id, ruta, ubicacion) AS (
        SELECT id, '', NULL FROM nodos WHERE id = :carpetaId
        UNION ALL
        SELECT n.id,
               CASE WHEN sub.ruta = '' THEN n.nombre ELSE sub.ruta || ' / ' || n.nombre END,
               sub.ruta
        FROM nodos n JOIN sub ON n.padre_id = sub.id
        WHERE ${VISIBLE}
      )
      SELECT ${COLUMNAS_ELEMENTO}, sub.ubicacion
      FROM sub
      JOIN nodos n ON n.id = sub.id
      LEFT JOIN versiones v ON v.id = n.version_actual_id
      WHERE n.id <> :carpetaId AND n.nombre LIKE :patron ESCAPE '\\'
      ORDER BY n.tipo = 'ARCHIVO', n.nombre COLLATE NOCASE
      LIMIT :limite
    `),
    resumen: db.prepare(`
      WITH RECURSIVE sub (id) AS (
        SELECT id FROM nodos WHERE padre_id = ?
        UNION ALL
        SELECT n.id FROM nodos n JOIN sub ON n.padre_id = sub.id
      )
      SELECT COALESCE(SUM(n.tipo = 'CARPETA'), 0)                                   AS carpetas,
             COALESCE(SUM(n.tipo = 'ARCHIVO' AND n.version_actual_id IS NOT NULL), 0) AS archivos,
             COALESCE(SUM(v.tamano), 0)                                             AS tamanoTotal
      FROM sub
      JOIN nodos n ON n.id = sub.id
      LEFT JOIN versiones v ON v.id = n.version_actual_id
    `),
    arbol: db.prepare(`
      WITH RECURSIVE arbol (id, tipo, ruta, version_actual_id, modificado_en) AS (
        SELECT id, tipo, nombre, version_actual_id, modificado_en FROM nodos WHERE padre_id = ?
        UNION ALL
        SELECT n.id, n.tipo, a.ruta || '/' || n.nombre, n.version_actual_id, n.modificado_en
        FROM nodos n JOIN arbol a ON n.padre_id = a.id
      )
      SELECT a.id, a.tipo, a.ruta, a.modificado_en AS modificadoEn, v.id AS versionId, v.tamano
      FROM arbol a LEFT JOIN versiones v ON v.id = a.version_actual_id
      WHERE a.tipo = 'CARPETA' OR v.id IS NOT NULL
      ORDER BY a.ruta
    `),
    uso: db.prepare(`
      WITH RECURSIVE eliminados (id) AS (
        SELECT id FROM nodos WHERE espacio_id = :espacioId AND en_papelera = 1
        UNION ALL
        SELECT n.id FROM nodos n JOIN eliminados e ON n.padre_id = e.id
      )
      SELECT COALESCE(SUM(v.tamano), 0) AS total,
             COALESCE(SUM(CASE WHEN e.id IS NULL AND v.id = n.version_actual_id THEN v.tamano END), 0) AS archivos,
             COALESCE(SUM(CASE WHEN e.id IS NULL AND v.id <> n.version_actual_id THEN v.tamano END), 0) AS versionesAnteriores,
             COALESCE(SUM(CASE WHEN e.id IS NOT NULL THEN v.tamano END), 0) AS papelera,
             COUNT(DISTINCT CASE WHEN e.id IS NULL THEN n.version_actual_id END) AS cantidadArchivos
      FROM nodos n
      JOIN versiones v ON v.nodo_id = n.id AND v.estado = 'COMPLETA'
      LEFT JOIN eliminados e ON e.id = n.id
      WHERE n.espacio_id = :espacioId
    `),
    renombrar: db.prepare('UPDATE nodos SET nombre = ? WHERE id = ?'),
    mover: db.prepare('UPDATE nodos SET padre_id = ?, nombre = ? WHERE id = ?'),
    enviarAPapelera: db.prepare(`
      UPDATE nodos
      SET en_papelera = 1,
          eliminado_en = ${AHORA},
          padre_original_id = padre_id,
          padre_id = NULL
      WHERE id = ? AND es_raiz = 0 AND en_papelera = 0
    `),
    quitarFavoritosDeSubarbol: db.prepare(`
      WITH RECURSIVE sub (id) AS (
        SELECT ?
        UNION ALL
        SELECT n.id FROM nodos n JOIN sub ON n.padre_id = sub.id
      )
      DELETE FROM favoritos WHERE nodo_id IN (SELECT id FROM sub)
    `),
    papelera: db.prepare(`
      SELECT ${COLUMNAS_ELEMENTO},
             n.eliminado_en      AS eliminadoEn,
             n.padre_original_id AS padreOriginalId
      FROM nodos n LEFT JOIN versiones v ON v.id = n.version_actual_id
      WHERE n.espacio_id = :espacioId AND n.en_papelera = 1
      ORDER BY n.eliminado_en DESC
    `),
    restaurar: db.prepare(`
      UPDATE nodos
      SET en_papelera = 0, eliminado_en = NULL, padre_original_id = NULL, padre_id = ?, nombre = ?
      WHERE id = ? AND en_papelera = 1
    `),
    vaciarPapelera: db.prepare('DELETE FROM nodos WHERE espacio_id = ? AND en_papelera = 1'),
    purgarPapelerasPersonales: db.prepare(`
      DELETE FROM nodos
      WHERE en_papelera = 1 AND eliminado_en <= ?
        AND espacio_id IN (SELECT id FROM espacios WHERE tipo = 'PERSONAL')
    `),
    eliminar: db.prepare('DELETE FROM nodos WHERE id = ?'),
    eliminarArchivosSinContenido: db.prepare(`DELETE FROM nodos WHERE tipo = 'ARCHIVO' AND version_actual_id IS NULL`),
    actualizarVersionActual: db.prepare(`
      UPDATE nodos
      SET version_actual_id = :versionId,
          modificado_en = ${AHORA}
      WHERE id = :nodoId
    `),
    establecerColor: db.prepare('UPDATE nodos SET color = ? WHERE id = ?'),
    establecerColorGrupo: db.prepare(`
      UPDATE nodos
      SET color = :color, nota_color = :nota, nota_color_por = :usuarioId, nota_color_en = ${AHORA}
      WHERE id = :id
    `),
  };

  return {
    crear({ espacioId, padreId = null, tipo, nombre, esRaiz = false, color = null, creadoPor = null }) {
      const resultado = consultas.insertar.run({ espacioId, padreId, tipo, nombre, esRaiz: esRaiz ? 1 : 0, color, creadoPor });
      return Number(resultado.lastInsertRowid);
    },
    obtenerPorId(id) {
      return consultas.porId.get(id);
    },
    obtenerRaiz(espacioId) {
      return consultas.raizDe.get(espacioId);
    },
    hijoPorNombre(padreId, nombre) {
      return consultas.hijoPorNombre.get(padreId, nombre);
    },
    nombresHijos(padreId) {
      return consultas.nombresHijos.all(padreId);
    },
    hijosVisibles(padreId) {
      return consultas.hijosVisibles.all(padreId);
    },
    // Ancestros desde la raíz hasta el propio nodo (incluido).
    cadena(id) {
      return consultas.cadena.all(id);
    },
    obtenerElemento(id, usuarioId) {
      return consultas.elemento.get({ id, usuarioId });
    },
    listarContenido(padreId, usuarioId) {
      return consultas.contenido.all({ padreId, usuarioId });
    },
    listarSubcarpetas(padreId, usuarioId) {
      return consultas.subcarpetas.all({ padreId, usuarioId });
    },
    buscar({ carpetaId, patron, limite, usuarioId }) {
      return consultas.buscar.all({ carpetaId, patron, limite, usuarioId });
    },
    resumenCarpeta(id) {
      return consultas.resumen.get(id);
    },
    // Todo lo que hay dentro de una carpeta con su ruta relativa ("Sub/archivo.txt"); sin subidas en curso.
    arbol(carpetaId) {
      return consultas.arbol.all(carpetaId);
    },
    // Bytes guardados en un espacio, incluidas las versiones anteriores y la papelera.
    uso(espacioId) {
      return consultas.uso.get({ espacioId });
    },
    renombrar(id, nombre) {
      consultas.renombrar.run(nombre, id);
    },
    mover(id, padreId, nombre) {
      consultas.mover.run(padreId, nombre, id);
    },
    enviarAPapelera(id) {
      consultas.quitarFavoritosDeSubarbol.run(id);
      return consultas.enviarAPapelera.run(id).changes === 1;
    },
    listarPapelera(espacioId, usuarioId) {
      return consultas.papelera.all({ espacioId, usuarioId });
    },
    restaurar(id, padreId, nombre) {
      return consultas.restaurar.run(padreId, nombre, id).changes === 1;
    },
    vaciarPapelera(espacioId) {
      return consultas.vaciarPapelera.run(espacioId).changes;
    },
    purgarPapelerasPersonales(eliminadosAntesDe) {
      return consultas.purgarPapelerasPersonales.run(eliminadosAntesDe).changes;
    },
    eliminar(id) {
      consultas.eliminar.run(id);
    },
    eliminarArchivosSinContenido() {
      return consultas.eliminarArchivosSinContenido.run().changes;
    },
    establecerVersionActual(nodoId, versionId) {
      return consultas.actualizarVersionActual.run({ nodoId, versionId }).changes === 1;
    },
    establecerColor(id, color) {
      consultas.establecerColor.run(color, id);
    },
    establecerColorGrupo(id, { color, nota, usuarioId }) {
      consultas.establecerColorGrupo.run({ id, color, nota, usuarioId });
    },
  };
}
