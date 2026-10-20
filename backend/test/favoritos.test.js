import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { CARPETAS_SUGERIDAS } from '../src/services/espacioService.js';
import { contenido, crearCarpeta, crearCliente, prepararEspacio, registrar, subir } from './ayudantes.js';

describe('accesos rápidos', () => {
  let entorno;
  let ana;

  beforeEach(async () => {
    entorno = await prepararEspacio();
    ana = entorno.cliente;
  });

  afterEach(async () => {
    await entorno.servidor.cerrar();
  });

  async function accesos(cliente = ana) {
    return (await cliente.pedir('GET', '/api/favoritos')).cuerpo.favoritos.map((f) => f.nombre);
  }

  test('empiezan con las carpetas sugeridas en orden', async () => {
    assert.deepEqual(await accesos(), CARPETAS_SUGERIDAS);
  });

  test('fijar agrega la carpeta al final sin duplicarla', async () => {
    const universidad = await crearCarpeta(ana, entorno.carpetas.Documentos, 'Universidad');

    const { estado, cuerpo } = await ana.pedir('POST', '/api/favoritos', { nodoId: universidad });
    assert.equal(estado, 200);
    assert.deepEqual(cuerpo.favoritos.map((f) => f.nombre), [...CARPETAS_SUGERIDAS, 'Universidad']);

    await ana.pedir('POST', '/api/favoritos', { nodoId: universidad });
    assert.equal((await accesos()).length, 5);
  });

  test('solo se pueden fijar carpetas propias y no Mi espacio', async () => {
    const archivo = (await subir(ana, entorno.raiz, 'nota.txt', 'n')).cuerpo.elemento.id;
    assert.equal((await ana.pedir('POST', '/api/favoritos', { nodoId: archivo })).estado, 400);
    assert.equal((await ana.pedir('POST', '/api/favoritos', { nodoId: entorno.raiz })).estado, 400);

    const bea = crearCliente(entorno.servidor.url);
    await registrar(bea, 'bea@deskcloud.test');
    assert.equal((await bea.pedir('POST', '/api/favoritos', { nodoId: entorno.carpetas.Documentos })).estado, 404);
  });

  test('quitar un acceso rápido no borra la carpeta', async () => {
    const { cuerpo } = await ana.pedir('DELETE', `/api/favoritos/${entorno.carpetas.Audio}`);
    assert.deepEqual(cuerpo.favoritos.map((f) => f.nombre), ['Documentos', 'Imágenes', 'Videos']);

    const audio = (await contenido(ana, entorno.raiz)).elementos.find((e) => e.nombre === 'Audio');
    assert.equal(audio.esFavorito, false);
  });

  test('se pueden reordenar', async () => {
    const { Documentos, Imágenes, Audio, Videos } = entorno.carpetas;
    const { cuerpo } = await ana.pedir('PUT', '/api/favoritos/orden', { ids: [Videos, Audio, Documentos, Imágenes] });
    assert.deepEqual(cuerpo.favoritos.map((f) => f.nombre), ['Videos', 'Audio', 'Documentos', 'Imágenes']);

    const incompleta = await ana.pedir('PUT', '/api/favoritos/orden', { ids: [Videos, Audio] });
    assert.equal(incompleta.estado, 400);
  });

  test('desaparecen al enviar su carpeta (o una que la contiene) a la papelera', async () => {
    const universidad = await crearCarpeta(ana, entorno.carpetas.Documentos, 'Universidad');
    await ana.pedir('POST', '/api/favoritos', { nodoId: universidad });

    await ana.pedir('POST', '/api/nodos/papelera', { ids: [entorno.carpetas.Documentos] });
    assert.deepEqual(await accesos(), ['Imágenes', 'Audio', 'Videos']);
  });
});
