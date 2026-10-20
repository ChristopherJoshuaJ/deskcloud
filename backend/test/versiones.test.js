import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { contar, crearCliente, descargar, prepararEspacio, registrar, subir } from './ayudantes.js';

describe('versiones', () => {
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

  // Sube "primera" y la reemplaza por "segunda": el archivo queda con dos versiones.
  async function archivoConDosVersiones(nombre = 'notas.txt') {
    await subir(ana, documentos, nombre, 'primera', { tipo: 'text/plain' });
    const { cuerpo } = await subir(ana, documentos, nombre, 'segunda', { tipo: 'text/plain', conflicto: 'reemplazar' });
    return cuerpo.elemento;
  }

  async function versiones(id) {
    return (await ana.pedir('GET', `/api/nodos/${id}/versiones`)).cuerpo.versiones;
  }

  test('muestra el historial de la más reciente a la más antigua', async () => {
    const archivo = await archivoConDosVersiones();
    const lista = await versiones(archivo.id);

    assert.deepEqual(
      lista.map((v) => [v.numero, v.esActual, v.tamano]),
      [
        [2, true, 7],
        [1, false, 7],
      ],
    );
    assert.deepEqual(lista[0].autor, { id: entorno.usuario.id, nombre: 'Persona' });
    assert.equal(lista[0].tipoVista, 'texto');
    assert.equal(lista[0].restauradaDe, null);
  });

  test('descarga y muestra una versión anterior con su número en el nombre', async () => {
    const archivo = await archivoConDosVersiones();
    const [actual, anterior] = await versiones(archivo.id);

    const descarga = await ana.pedir('GET', `/api/nodos/${archivo.id}/versiones/${anterior.id}/descarga`);
    assert.equal(descarga.datos.toString(), 'primera');
    assert.match(descarga.cabeceras.get('content-disposition'), /notas%20%28versi%C3%B3n%201%29\.txt/);

    const vistaActual = await ana.pedir('GET', `/api/nodos/${archivo.id}/versiones/${actual.id}/vista`);
    assert.equal(vistaActual.datos.toString(), 'segunda');
    assert.match(vistaActual.cabeceras.get('content-disposition'), /filename="notas\.txt"/);
  });

  test('restaurar crea una versión nueva con el contenido antiguo', async () => {
    const archivo = await archivoConDosVersiones();
    const [actual, anterior] = await versiones(archivo.id);

    const { estado, cuerpo } = await ana.pedir('POST', `/api/nodos/${archivo.id}/versiones/${anterior.id}/restaurar`);
    assert.equal(estado, 201);
    assert.equal(cuerpo.version.numero, 3);
    assert.equal(cuerpo.version.restauradaDe, 1);
    assert.equal(cuerpo.version.esActual, true);
    assert.equal(cuerpo.elemento.version, 3);
    assert.equal(await descargar(ana, archivo.id), 'primera');
    assert.deepEqual((await versiones(archivo.id)).map((v) => v.numero), [3, 2, 1]);

    const yaActual = await ana.pedir('POST', `/api/nodos/${archivo.id}/versiones/${cuerpo.version.id}/restaurar`);
    assert.equal(yaActual.estado, 400);

    const deNuevoLaDos = await ana.pedir('POST', `/api/nodos/${archivo.id}/versiones/${actual.id}/restaurar`);
    assert.equal(deNuevoLaDos.cuerpo.version.numero, 4);
    assert.equal(await descargar(ana, archivo.id), 'segunda');
  });

  test('elimina versiones anteriores pero nunca la actual', async () => {
    const archivo = await archivoConDosVersiones();
    const [actual, anterior] = await versiones(archivo.id);
    const fragmentosAntes = contar(entorno.db, 'fragmentos');

    const { cuerpo } = await ana.pedir('DELETE', `/api/nodos/${archivo.id}/versiones/${anterior.id}`);
    assert.deepEqual(cuerpo.versiones.map((v) => v.numero), [2]);
    assert.ok(contar(entorno.db, 'fragmentos') < fragmentosAntes);

    const laActual = await ana.pedir('DELETE', `/api/nodos/${archivo.id}/versiones/${actual.id}`);
    assert.equal(laActual.estado, 400);
    assert.equal(await descargar(ana, archivo.id), 'segunda');

    const yaBorrada = await ana.pedir('GET', `/api/nodos/${archivo.id}/versiones/${anterior.id}/descarga`);
    assert.equal(yaBorrada.estado, 404);
  });

  test('una versión solo se alcanza a través de su propio archivo', async () => {
    const notas = await archivoConDosVersiones('notas.txt');
    const otro = await archivoConDosVersiones('otro.txt');
    const [versionDeOtro] = await versiones(otro.id);

    const cruzada = await ana.pedir('GET', `/api/nodos/${notas.id}/versiones/${versionDeOtro.id}/descarga`);
    assert.equal(cruzada.estado, 404);
    const restaurarCruzada = await ana.pedir('POST', `/api/nodos/${notas.id}/versiones/${versionDeOtro.id}/restaurar`);
    assert.equal(restaurarCruzada.estado, 404);
    assert.equal((await ana.pedir('GET', `/api/nodos/${notas.id}/versiones/abc/descarga`)).estado, 404);
  });

  test('nadie más ve las versiones y una carpeta no tiene versiones', async () => {
    const archivo = await archivoConDosVersiones();
    const [, anterior] = await versiones(archivo.id);

    const bea = crearCliente(entorno.servidor.url);
    await registrar(bea, 'bea@deskcloud.test');
    assert.equal((await bea.pedir('GET', `/api/nodos/${archivo.id}/versiones`)).estado, 404);
    assert.equal((await bea.pedir('POST', `/api/nodos/${archivo.id}/versiones/${anterior.id}/restaurar`)).estado, 404);
    assert.equal((await bea.pedir('DELETE', `/api/nodos/${archivo.id}/versiones/${anterior.id}`)).estado, 404);

    assert.equal((await ana.pedir('GET', `/api/nodos/${documentos}/versiones`)).estado, 400);
  });

  test('las versiones viajan con el archivo a la papelera y vuelven al restaurarlo', async () => {
    const archivo = await archivoConDosVersiones();
    await ana.pedir('POST', '/api/nodos/papelera', { ids: [archivo.id] });
    assert.equal((await ana.pedir('GET', `/api/nodos/${archivo.id}/versiones`)).estado, 404);

    await ana.pedir('POST', '/api/papelera/restaurar', { ids: [archivo.id] });
    assert.deepEqual((await versiones(archivo.id)).map((v) => v.numero), [2, 1]);
  });

  test('una copia empieza su propio historial con solo la versión actual', async () => {
    const archivo = await archivoConDosVersiones();
    const { cuerpo } = await ana.pedir('POST', '/api/nodos/copiar', {
      ids: [archivo.id],
      destinoId: entorno.raiz,
    });
    const copia = cuerpo.elementos[0];
    const lista = await versiones(copia.id);
    assert.deepEqual(lista.map((v) => v.numero), [1]);
    assert.equal(await descargar(ana, copia.id), 'segunda');
  });
});
