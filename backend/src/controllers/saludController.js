export function crearSaludController({ db }) {
  const consultaEstado = db.prepare(
    'SELECT sqlite_version() AS versionSqlite, (SELECT user_version FROM pragma_user_version) AS versionEsquema',
  );

  return {
    estado(req, res) {
      const { versionSqlite, versionEsquema } = consultaEstado.get();
      res.json({ estado: 'ok', baseDatos: { versionSqlite, versionEsquema } });
    },
  };
}
