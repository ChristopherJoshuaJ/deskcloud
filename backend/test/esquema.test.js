import assert from 'node:assert/strict';
import { beforeEach, describe, test } from 'node:test';
import { migrar, versionEsquema } from '../src/db/index.js';
import { contar, crearBaseDatosPrueba, crearEspacioConArchivo, crearNodo, crearRaiz, crearUsuario } from './ayudantes.js';

describe('esquema de la base de datos', () => {
  let db;
  beforeEach(() => {
    db = crearBaseDatosPrueba();
  });

  test('crea todas las tablas y registra la versión del esquema', () => {
    const tablas = db
      .prepare(`SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name`)
      .all()
      .map((fila) => fila.name);
    assert.deepEqual(tablas, [
      'actividad',
      'ajustes',
      'avisos',
      'colores_personales',
      'espacios',
      'favoritos',
      'fragmentos',
      'invitaciones',
      'miembros',
      'nodos',
      'propuesta_nodos',
      'propuestas',
      'sesiones',
      'sin_ver',
      'usuarios',
      'versiones',
      'votos',
    ]);
    assert.equal(versionEsquema(db), 5);
  });

  test('las migraciones no se aplican dos veces', () => {
    assert.deepEqual(migrar(db), []);
  });

  test('el correo es único sin distinguir mayúsculas', () => {
    crearUsuario(db, 'ana@deskcloud.test');
    assert.throws(() => crearUsuario(db, 'ANA@deskcloud.test'), /UNIQUE/);
  });

  test('cada usuario tiene una sola raíz', () => {
    const usuarioId = crearUsuario(db);
    crearRaiz(db, usuarioId);
    assert.throws(() => crearRaiz(db, usuarioId), /UNIQUE/);
  });

  test('no se repiten nombres dentro de una misma carpeta', () => {
    const { usuarioId, raizId } = crearEspacioConArchivo(db, 'Notas.txt');
    assert.throws(() => crearNodo(db, { usuarioId, padreId: raizId, nombre: 'notas.TXT' }), /UNIQUE/);
  });

  test('un elemento normal necesita carpeta padre salvo que esté en la papelera', () => {
    const usuarioId = crearUsuario(db);
    crearRaiz(db, usuarioId);
    assert.throws(() => crearNodo(db, { usuarioId, padreId: null, nombre: 'suelto.txt' }), /CHECK/);
  });

  test('una carpeta no puede tener versión de contenido', () => {
    const { usuarioId, raizId } = crearEspacioConArchivo(db);
    const carpetaId = crearNodo(db, { usuarioId, padreId: raizId, nombre: 'Documentos', tipo: 'CARPETA' });
    db.prepare(`INSERT INTO versiones (id, nodo_id, tamano_fragmento) VALUES (99, ?, 1024)`).run(carpetaId);
    assert.throws(() => db.prepare('UPDATE nodos SET version_actual_id = 99 WHERE id = ?').run(carpetaId), /CHECK/);
  });

  test('borrar una carpeta definitivamente borra su contenido, versiones y fragmentos', () => {
    const { usuarioId, raizId } = crearEspacioConArchivo(db);
    const carpetaId = crearNodo(db, { usuarioId, padreId: raizId, nombre: 'Proyecto', tipo: 'CARPETA' });
    const archivoId = crearNodo(db, { usuarioId, padreId: carpetaId, nombre: 'plano.png' });
    db.prepare(`INSERT INTO versiones (id, nodo_id, tamano_fragmento) VALUES (7, ?, 4)`).run(archivoId);
    db.prepare(`INSERT INTO fragmentos (version_id, indice, datos) VALUES (7, 0, x'00010203')`).run();

    db.prepare('DELETE FROM nodos WHERE id = ?').run(carpetaId);

    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM nodos WHERE id IN (?, ?)').get(carpetaId, archivoId).total, 0);
    assert.equal(contar(db, 'versiones'), 0);
    assert.equal(contar(db, 'fragmentos'), 0);
  });
});
