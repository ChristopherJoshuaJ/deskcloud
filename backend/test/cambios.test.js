import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { avisos, contenido, crearCarpeta, crearCliente, elementoDe, prepararEquipo, registrar, subir } from './ayudantes.js';

describe('punto de cambios en los espacios compartidos', () => {
  let equipo;
  let ana;
  let bea;
  let cata;
  let raiz;
  let docs;
  let sub;

  beforeEach(async () => {
    equipo = await prepararEquipo();
    ({ ana, bea, cata } = equipo);
    raiz = equipo.espacio.raizId;
    docs = await crearCarpeta(ana, raiz, 'Docs');
    sub = await crearCarpeta(ana, docs, 'Sub');
    await marcarTodo(bea);
    await marcarTodo(cata);
  });

  afterEach(async () => {
    await equipo.servidor.cerrar();
  });

  function marcarTodo(cliente) {
    return cliente.pedir('POST', '/api/nodos/visto', { ids: [raiz], incluirContenido: true });
  }

  async function punto(cliente, carpetaId, nombre) {
    return (await elementoDe(cliente, carpetaId, nombre)).sinVer;
  }

  async function puntoEnBarra(cliente) {
    return (await cliente.pedir('GET', '/api/espacios')).cuerpo.compartidos[0].sinVer;
  }

  test('un cambio marca el elemento y todas sus carpetas hasta el espacio', async () => {
    const archivo = (await subir(ana, sub, 'nuevo.txt', 'x')).cuerpo.elemento;

    assert.equal(await punto(bea, sub, 'nuevo.txt'), true);
    assert.equal(await punto(bea, docs, 'Sub'), true);
    assert.equal(await punto(bea, raiz, 'Docs'), true);
    assert.equal(await puntoEnBarra(bea), true);

    assert.equal(await punto(ana, raiz, 'Docs'), false);
    assert.equal(await puntoEnBarra(ana), false);

    await contenido(bea, docs);
    assert.equal(await punto(bea, raiz, 'Docs'), true);

    await bea.pedir('GET', `/api/nodos/${archivo.id}/descarga`);
    assert.equal(await punto(bea, sub, 'nuevo.txt'), false);
    assert.equal(await punto(bea, docs, 'Sub'), false);
    assert.equal(await punto(bea, raiz, 'Docs'), false);
    assert.equal(await puntoEnBarra(bea), false);

    assert.equal(await punto(cata, raiz, 'Docs'), true);
  });

  test('se puede marcar como visto un elemento o todo lo de una carpeta', async () => {
    const a = (await subir(bea, sub, 'a.txt', 'a')).cuerpo.elemento;
    await subir(bea, sub, 'b.txt', 'b');

    assert.equal((await ana.pedir('POST', '/api/nodos/visto', { ids: [a.id] })).estado, 204);
    assert.equal(await punto(ana, sub, 'a.txt'), false);
    assert.equal(await punto(ana, docs, 'Sub'), true);

    await ana.pedir('POST', '/api/nodos/visto', { ids: [docs], incluirContenido: true });
    assert.equal(await punto(ana, sub, 'b.txt'), false);
    assert.equal(await punto(ana, raiz, 'Docs'), false);
  });

  test('cuentan los cambios de los demás pero no los colores personales', async () => {
    await ana.pedir('PUT', `/api/nodos/${docs}/color`, { color: '#4668a1' });
    assert.equal(await punto(bea, raiz, 'Docs'), true);
    await marcarTodo(bea);

    await cata.pedir('PUT', `/api/nodos/${docs}/color`, { color: '#e05757' });
    assert.equal(await punto(bea, raiz, 'Docs'), false);

    await cata.pedir('PUT', `/api/nodos/${docs}/color`, { color: '#e05757', paraTodos: true, nota: 'Urgente' });
    assert.equal(await punto(bea, raiz, 'Docs'), true);
  });

  test('si algo sale de una carpeta, la carpeta cuenta como cambiada', async () => {
    const archivo = (await subir(ana, sub, 'a.txt', 'a')).cuerpo.elemento;
    await marcarTodo(bea);
    await ana.pedir('POST', '/api/nodos/mover', { ids: [archivo.id], destinoId: raiz });
    assert.equal(await punto(bea, docs, 'Sub'), true);
    assert.equal(await punto(bea, raiz, 'a.txt'), true);
  });

  test('una propuesta de eliminación marca el elemento', async () => {
    await ana.pedir('POST', `/api/espacios/${equipo.espacio.id}/propuestas`, { tipo: 'eliminar', ids: [sub] });
    assert.equal(await punto(bea, docs, 'Sub'), true);
  });

  test('quien entra después solo ve los cambios posteriores', async () => {
    await subir(bea, sub, 'viejo.txt', 'x');
    const dani = crearCliente(equipo.servidor.url);
    await registrar(dani, 'dani@deskcloud.test');
    await ana.pedir('POST', `/api/espacios/${equipo.espacio.id}/invitaciones`, { correo: 'dani@deskcloud.test' });
    const [invitacion] = (await dani.pedir('GET', '/api/invitaciones')).cuerpo.invitaciones;
    await dani.pedir('POST', `/api/invitaciones/${invitacion.id}/aceptar`);
    assert.equal(await punto(dani, raiz, 'Docs'), false);

    await subir(bea, sub, 'nuevo.txt', 'x');
    assert.equal(await punto(dani, raiz, 'Docs'), true);
  });

  test('en Mi espacio no hay puntos', async () => {
    const raizBea = equipo.usuarios.bea.usuario.raizId;
    await subir(bea, raizBea, 'propio.txt', 'x');
    assert.equal(await punto(bea, raizBea, 'propio.txt'), false);
    assert.equal(equipo.db.prepare('SELECT COUNT(*) AS total FROM sin_ver').get().total, 0);
  });

  test('el resumen de avisos cuenta no leídos, invitaciones y votos pendientes', async () => {
    assert.equal((await bea.pedir('GET', '/api/avisos/resumen')).cuerpo.noLeidos, 1);
    await bea.pedir('POST', '/api/avisos/leidos', {});
    const archivo = (await subir(ana, raiz, 'a.txt', 'x')).cuerpo.elemento;
    await ana.pedir('POST', `/api/espacios/${equipo.espacio.id}/propuestas`, { tipo: 'eliminar', ids: [archivo.id] });

    const resumen = (await bea.pedir('GET', '/api/avisos/resumen')).cuerpo;
    assert.deepEqual(resumen, { noLeidos: 1, invitaciones: 0, votosPendientes: 1 });

    const [aviso] = await avisos(bea);
    await bea.pedir('POST', '/api/avisos/leidos', { ids: [aviso.id] });
    assert.equal((await bea.pedir('GET', '/api/avisos/resumen')).cuerpo.noLeidos, 0);
    assert.equal((await avisos(bea))[0].leido, true);
  });
});
