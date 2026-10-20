import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { contar, crearCarpeta, crearCliente, descargar, idDe, nombres, prepararEspacio, registrar, subir } from './ayudantes.js';

describe('papelera', () => {
  let entorno;
  let ana;
  let documentos;

  beforeEach(async () => {
    entorno = await prepararEspacio();
    ana = entorno.cliente;
    documentos = entorno.carpetas.Documentos;
  });

  afterEach(async () => {
    await entorno.servidor.cerrar();
  });

  async function papelera(cliente = ana) {
    return (await cliente.pedir('GET', '/api/papelera')).cuerpo.elementos;
  }

  async function aPapelera(...ids) {
    return ana.pedir('POST', '/api/nodos/papelera', { ids });
  }

  test('lista lo eliminado con su ubicación original, sin desplegar el contenido de las carpetas', async () => {
    assert.deepEqual(await papelera(), []);
    const nota = (await subir(ana, documentos, 'nota.txt', 'n')).cuerpo.elemento.id;
    const proyecto = await crearCarpeta(ana, documentos, 'Proyecto');
    await subir(ana, proyecto, 'dentro.txt', 'd');

    await aPapelera(nota, proyecto);
    const elementos = await papelera();

    assert.deepEqual(elementos.map((e) => e.nombre).sort(), ['Proyecto', 'nota.txt']);
    for (const e of elementos) {
      assert.ok(e.eliminadoEn);
      assert.deepEqual(e.ubicacionOriginal.map((r) => r.nombre), ['Mi espacio', 'Documentos']);
    }
  });

  test('restaurar devuelve el elemento a su carpeta con todo su contenido', async () => {
    const proyecto = await crearCarpeta(ana, documentos, 'Proyecto');
    const dentro = (await subir(ana, proyecto, 'dentro.txt', 'contenido')).cuerpo.elemento.id;
    await aPapelera(proyecto);

    const { estado, cuerpo } = await ana.pedir('POST', '/api/papelera/restaurar', { ids: [proyecto] });
    assert.equal(estado, 200);
    assert.equal(cuerpo.elementos[0].padreId, documentos);
    assert.deepEqual(await nombres(ana, documentos), ['Proyecto']);
    assert.equal(await descargar(ana, dentro), 'contenido');
    assert.deepEqual(await papelera(), []);
  });

  test('si la carpeta original ya no existe, restaura en Mi espacio', async () => {
    const proyecto = await crearCarpeta(ana, documentos, 'Proyecto');
    const informe = (await subir(ana, proyecto, 'informe.txt', 'i')).cuerpo.elemento.id;
    await aPapelera(informe);
    await aPapelera(proyecto);

    const enPapelera = (await papelera()).find((e) => e.id === informe);
    assert.equal(enPapelera.ubicacionOriginal, null);

    await ana.pedir('POST', '/api/papelera/restaurar', { ids: [informe] });
    assert.equal(await idDe(ana, entorno.raiz, 'informe.txt'), informe);
  });

  test('si el nombre está ocupado al restaurar, se renombra automáticamente', async () => {
    const primero = (await subir(ana, documentos, 'a.txt', 'primero')).cuerpo.elemento.id;
    await aPapelera(primero);
    const segundo = (await subir(ana, documentos, 'a.txt', 'segundo')).cuerpo.elemento.id;
    await aPapelera(segundo);
    await subir(ana, documentos, 'a.txt', 'tercero');

    await ana.pedir('POST', '/api/papelera/restaurar', { ids: [primero, segundo] });
    assert.deepEqual(await nombres(ana, documentos), ['a (2).txt', 'a (3).txt', 'a.txt']);
  });

  test('eliminar definitivamente borra el contenido guardado', async () => {
    const archivo = (await subir(ana, documentos, 'grande.bin', Buffer.alloc(5000, 1))).cuerpo.elemento.id;
    const activo = (await subir(ana, documentos, 'activo.txt', 'a')).cuerpo.elemento.id;
    await aPapelera(archivo);

    assert.equal((await ana.pedir('POST', '/api/papelera/eliminar', { ids: [activo] })).estado, 404);

    const { cuerpo } = await ana.pedir('POST', '/api/papelera/eliminar', { ids: [archivo] });
    assert.equal(cuerpo.eliminados, 1);
    assert.deepEqual(await papelera(), []);
    assert.equal(entorno.db.prepare('SELECT COUNT(*) AS total FROM versiones WHERE nodo_id = ?').get(archivo).total, 0);
    assert.equal(contar(entorno.db, 'fragmentos'), 1);
  });

  test('vaciar elimina todo lo de la papelera propia', async () => {
    const bea = crearCliente(entorno.servidor.url);
    const raizBea = (await registrar(bea, 'bea@deskcloud.test')).raizId;
    const deBea = (await subir(bea, raizBea, 'de-bea.txt', 'b')).cuerpo.elemento.id;
    await bea.pedir('POST', '/api/nodos/papelera', { ids: [deBea] });

    const proyecto = await crearCarpeta(ana, documentos, 'Proyecto');
    await subir(ana, proyecto, 'x.txt', 'x');
    await aPapelera(proyecto, (await subir(ana, documentos, 'y.txt', 'y')).cuerpo.elemento.id);

    const { cuerpo } = await ana.pedir('POST', '/api/papelera/vaciar');
    assert.equal(cuerpo.eliminados, 2);
    assert.deepEqual(await papelera(), []);
    assert.equal((await papelera(bea)).length, 1);
  });

  test('nadie más puede ver ni restaurar la papelera propia', async () => {
    const nota = (await subir(ana, documentos, 'nota.txt', 'n')).cuerpo.elemento.id;
    await aPapelera(nota);

    const bea = crearCliente(entorno.servidor.url);
    await registrar(bea, 'bea@deskcloud.test');
    assert.deepEqual(await papelera(bea), []);
    assert.equal((await bea.pedir('POST', '/api/papelera/restaurar', { ids: [nota] })).estado, 404);
    assert.equal((await bea.pedir('POST', '/api/papelera/eliminar', { ids: [nota] })).estado, 404);
  });

  test('cada elemento indica en cuántos días se borrará solo', async () => {
    const nota = (await subir(ana, documentos, 'nota.txt', 'n')).cuerpo.elemento.id;
    await aPapelera(nota);
    const hace10Dias = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    entorno.db.prepare('UPDATE nodos SET eliminado_en = ? WHERE id = ?').run(hace10Dias, nota);

    const [elemento] = await papelera();
    assert.equal(elemento.diasRestantes, 20);
    assert.equal(Date.parse(elemento.seEliminaEn) - Date.parse(elemento.eliminadoEn), 30 * 24 * 60 * 60 * 1000);
  });

  test('a los 30 días se borra solo lo de Mi espacio, con su contenido', async () => {
    const viejo = await crearCarpeta(ana, documentos, 'Viejo');
    await subir(ana, viejo, 'dentro.txt', 'd');
    const reciente = (await subir(ana, documentos, 'reciente.txt', 'r')).cuerpo.elemento.id;
    await aPapelera(viejo, reciente);
    const hace31Dias = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
    entorno.db.prepare('UPDATE nodos SET eliminado_en = ? WHERE id = ?').run(hace31Dias, viejo);

    const compartido = (await ana.pedir('POST', '/api/espacios', { nombre: 'Equipo' })).cuerpo.espacio;
    const archivoEquipo = (await subir(ana, compartido.raizId, 'equipo.txt', 'e')).cuerpo.elemento.id;
    await ana.pedir('POST', `/api/espacios/${compartido.id}/propuestas`, { tipo: 'eliminar', ids: [archivoEquipo] });
    entorno.db.prepare('UPDATE nodos SET eliminado_en = ? WHERE id = ?').run(hace31Dias, archivoEquipo);

    assert.equal(entorno.servidor.servicios.papelera.purgarVencidos(), 1);
    assert.deepEqual((await papelera()).map((e) => e.nombre), ['reciente.txt']);
    assert.equal(entorno.db.prepare(`SELECT COUNT(*) AS total FROM nodos WHERE nombre = 'dentro.txt'`).get().total, 0);
    assert.equal(contar(entorno.db, 'fragmentos'), 2);

    const papeleraEquipo = (await ana.pedir('GET', `/api/espacios/${compartido.id}/papelera`)).cuerpo.elementos;
    assert.equal(papeleraEquipo[0].diasRestantes, null);
  });
});
