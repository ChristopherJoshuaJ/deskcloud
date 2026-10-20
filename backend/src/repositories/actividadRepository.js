export function crearActividadRepository(db) {
  const insertar = db.prepare(`
    INSERT INTO actividad (espacio_id, usuario_id, accion, nodo_id, nombre, detalles)
    VALUES (:espacioId, :usuarioId, :accion, :nodoId, :nombre, :detalles)
  `);
  const listar = db.prepare(`
    SELECT a.id, a.accion, a.nodo_id AS nodoId, a.nombre, a.detalles, a.creado_en AS creadoEn,
           u.id AS usuarioId, u.nombre AS usuarioNombre
    FROM actividad a LEFT JOIN usuarios u ON u.id = a.usuario_id
    WHERE a.espacio_id = :espacioId AND (:antesDe IS NULL OR a.id < :antesDe)
    ORDER BY a.id DESC
    LIMIT :limite
  `);

  return {
    registrar({ espacioId, usuarioId = null, accion, nodoId = null, nombre = null, detalles = {} }) {
      insertar.run({ espacioId, usuarioId, accion, nodoId, nombre, detalles: JSON.stringify(detalles) });
    },
    // Paginado hacia atrás: antesDe es el id del último registro de la página anterior.
    listar(espacioId, { antesDe = null, limite }) {
      return listar.all({ espacioId, antesDe, limite });
    },
  };
}
