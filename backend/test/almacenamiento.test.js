import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { setImmediate as siguienteTurno } from 'node:timers/promises';
import { beforeEach, describe, test } from 'node:test';
import { RangoInvalido, RecursoNoEncontrado, ReglaNegocio } from '../src/errores.js';
import { crearAlmacenamientoService } from '../src/services/almacenamientoService.js';
import { contar, crearBaseDatosPrueba, crearEspacioConArchivo, crearNodo, leerStream } from './ayudantes.js';

const TAMANO_FRAGMENTO = 1024;

async function* enTrozos(datos, tamanoTrozo) {
  for (let i = 0; i < datos.length; i += tamanoTrozo) {
    await siguienteTurno();
    yield datos.subarray(i, i + tamanoTrozo);
  }
}

describe('almacenamiento en fragmentos', () => {
  let db;
  let almacenamiento;
  let espacio;

  beforeEach(() => {
    db = crearBaseDatosPrueba();
    almacenamiento = crearAlmacenamientoService(db, { tamanoFragmento: TAMANO_FRAGMENTO });
    espacio = crearEspacioConArchivo(db);
  });

  test('divide el archivo en fragmentos y lo reconstruye idéntico', async () => {
    const original = randomBytes(TAMANO_FRAGMENTO * 5 + 321);
    const version = await almacenamiento.guardarContenido({
      nodoId: espacio.archivoId,
      contenido: enTrozos(original, 700),
      mime: 'application/pdf',
      usuarioId: espacio.usuarioId,
    });

    assert.equal(version.numero, 1);
    assert.equal(version.tamano, original.length);
    assert.equal(version.totalFragmentos, 6);
    assert.equal(contar(db, 'fragmentos'), 6);

    const { stream } = almacenamiento.abrirLectura(version.id);
    assert.deepEqual(await leerStream(stream), original);
    assert.deepEqual(almacenamiento.leerCompleto(version.id), original);
    assert.equal(almacenamiento.verificarIntegridad(version.id), true);
  });

  test('el contenido guardado no depende del original', async () => {
    const original = Buffer.from('contenido que luego se borra del disco');
    const version = await almacenamiento.guardarContenido({ nodoId: espacio.archivoId, contenido: original });
    original.fill(0);
    assert.equal(almacenamiento.leerCompleto(version.id).toString(), 'contenido que luego se borra del disco');
  });

  test('maneja archivos vacíos y de tamaño exacto a un fragmento', async () => {
    const vacio = await almacenamiento.guardarContenido({ nodoId: espacio.archivoId, contenido: Buffer.alloc(0) });
    assert.equal(vacio.tamano, 0);
    assert.equal(vacio.totalFragmentos, 0);
    assert.equal(almacenamiento.leerCompleto(vacio.id).length, 0);
    assert.equal(almacenamiento.verificarIntegridad(vacio.id), true);

    const exacto = randomBytes(TAMANO_FRAGMENTO * 2);
    const version = await almacenamiento.guardarContenido({ nodoId: espacio.archivoId, contenido: exacto });
    assert.equal(version.totalFragmentos, 2);
    assert.deepEqual(almacenamiento.leerCompleto(version.id), exacto);
  });

  test('lee rangos de bytes que cruzan fragmentos', async () => {
    const original = randomBytes(TAMANO_FRAGMENTO * 4);
    const version = await almacenamiento.guardarContenido({ nodoId: espacio.archivoId, contenido: original });

    const casos = [
      [0, 0],
      [1000, 1100],
      [TAMANO_FRAGMENTO, TAMANO_FRAGMENTO * 2 - 1],
      [500, TAMANO_FRAGMENTO * 3 + 10],
      [original.length - 1, original.length - 1],
    ];
    for (const [inicio, fin] of casos) {
      const lectura = almacenamiento.abrirLectura(version.id, { inicio, fin });
      assert.equal(lectura.longitud, fin - inicio + 1);
      assert.deepEqual(await leerStream(lectura.stream), original.subarray(inicio, fin + 1));
    }

    const hastaElFinal = almacenamiento.abrirLectura(version.id, { inicio: 4000, fin: 999999 });
    assert.equal(hastaElFinal.fin, original.length - 1);

    assert.throws(() => almacenamiento.abrirLectura(version.id, { inicio: original.length }), RangoInvalido);
    assert.throws(() => almacenamiento.abrirLectura(version.id, { inicio: 10, fin: 5 }), RangoInvalido);
  });

  test('cada guardado crea una versión nueva y se puede restaurar una anterior', async () => {
    const v1 = await almacenamiento.guardarContenido({ nodoId: espacio.archivoId, contenido: 'primera' });
    const v2 = await almacenamiento.guardarContenido({ nodoId: espacio.archivoId, contenido: 'segunda' });

    assert.deepEqual(
      almacenamiento.listarVersiones(espacio.archivoId).map((v) => v.numero),
      [2, 1],
    );
    assert.equal(almacenamiento.obtenerVersionActual(espacio.archivoId).id, v2.id);

    const v3 = almacenamiento.restaurarVersion(espacio.archivoId, v1.id);
    assert.equal(v3.numero, 3);
    assert.equal(v3.restauradaDe, 1);
    const actual = almacenamiento.obtenerVersionActual(espacio.archivoId);
    assert.equal(actual.id, v3.id);
    assert.equal(almacenamiento.leerCompleto(actual.id).toString(), 'primera');
    assert.ok(almacenamiento.verificarIntegridad(actual.id));
    assert.throws(() => almacenamiento.restaurarVersion(espacio.archivoId, v3.id), /ya es la versión actual/);
  });

  test('una subida interrumpida no deja fragmentos ni versiones', async () => {
    async function* subidaQueFalla() {
      yield randomBytes(TAMANO_FRAGMENTO * 3);
      await siguienteTurno();
      throw new Error('conexión perdida');
    }

    await assert.rejects(
      almacenamiento.guardarContenido({ nodoId: espacio.archivoId, contenido: subidaQueFalla() }),
      /conexión perdida/,
    );
    assert.equal(contar(db, 'versiones'), 0);
    assert.equal(contar(db, 'fragmentos'), 0);
    assert.throws(() => almacenamiento.obtenerVersionActual(espacio.archivoId), RecursoNoEncontrado);
  });

  test('dos subidas simultáneas al mismo archivo quedan como versiones separadas', async () => {
    const a = randomBytes(TAMANO_FRAGMENTO * 3 + 1);
    const b = randomBytes(TAMANO_FRAGMENTO * 2 + 7);

    const [va, vb] = await Promise.all([
      almacenamiento.guardarContenido({ nodoId: espacio.archivoId, contenido: enTrozos(a, 300) }),
      almacenamiento.guardarContenido({ nodoId: espacio.archivoId, contenido: enTrozos(b, 500) }),
    ]);

    assert.deepEqual([va.numero, vb.numero].sort(), [1, 2]);
    assert.deepEqual(almacenamiento.leerCompleto(va.id), a);
    assert.deepEqual(almacenamiento.leerCompleto(vb.id), b);
  });

  test('detecta fragmentos alterados o faltantes', async () => {
    const version = await almacenamiento.guardarContenido({
      nodoId: espacio.archivoId,
      contenido: randomBytes(TAMANO_FRAGMENTO * 2),
    });

    db.prepare(`UPDATE fragmentos SET datos = zeroblob(${TAMANO_FRAGMENTO}) WHERE version_id = ? AND indice = 1`).run(version.id);
    assert.equal(almacenamiento.verificarIntegridad(version.id), false);

    db.prepare('DELETE FROM fragmentos WHERE version_id = ? AND indice = 1').run(version.id);
    assert.equal(almacenamiento.verificarIntegridad(version.id), false);
    await assert.rejects(leerStream(almacenamiento.abrirLectura(version.id).stream), /Falta el fragmento 1/);
  });

  test('descarta al iniciar las subidas que quedaron pendientes', () => {
    db.prepare('INSERT INTO versiones (nodo_id, tamano_fragmento) VALUES (?, ?)').run(espacio.archivoId, TAMANO_FRAGMENTO);
    assert.equal(almacenamiento.limpiarPendientes(), 1);
    assert.equal(contar(db, 'versiones'), 0);
  });

  test('rechaza guardar contenido en una carpeta o en un archivo inexistente', async () => {
    const carpetaId = crearNodo(db, {
      usuarioId: espacio.usuarioId,
      padreId: espacio.raizId,
      nombre: 'Documentos',
      tipo: 'CARPETA',
    });
    await assert.rejects(almacenamiento.guardarContenido({ nodoId: carpetaId, contenido: 'x' }), ReglaNegocio);
    await assert.rejects(almacenamiento.guardarContenido({ nodoId: 9999, contenido: 'x' }), RecursoNoEncontrado);
  });
});
