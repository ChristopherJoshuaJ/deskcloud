export function crearUsuariosRepository(db) {
  const insertar = db.prepare('INSERT INTO usuarios (nombre, correo, hash_contrasena) VALUES (?, ?, ?)');
  const porCorreo = db.prepare(`
    SELECT id, nombre, correo, hash_contrasena AS hashContrasena, creado_en AS creadoEn
    FROM usuarios WHERE correo = ?
  `);
  const porId = db.prepare('SELECT id, nombre, correo, creado_en AS creadoEn FROM usuarios WHERE id = ?');
  const hashDe = db.prepare('SELECT hash_contrasena AS hashContrasena FROM usuarios WHERE id = ?');
  const cambiarNombre = db.prepare('UPDATE usuarios SET nombre = ? WHERE id = ?');
  const cambiarHash = db.prepare('UPDATE usuarios SET hash_contrasena = ? WHERE id = ?');
  const eliminar = db.prepare('DELETE FROM usuarios WHERE id = ?');

  return {
    hashContrasena(id) {
      return hashDe.get(id)?.hashContrasena ?? null;
    },
    cambiarNombre(id, nombre) {
      cambiarNombre.run(nombre, id);
    },
    cambiarContrasena(id, hashContrasena) {
      cambiarHash.run(hashContrasena, id);
    },
    eliminar(id) {
      eliminar.run(id);
    },
    crear({ nombre, correo, hashContrasena }) {
      return Number(insertar.run(nombre, correo, hashContrasena).lastInsertRowid);
    },
    obtenerConCredenciales(correo) {
      return porCorreo.get(correo);
    },
    obtenerPorId(id) {
      return porId.get(id);
    },
  };
}
