import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { avisos, contar, crearCarpeta, crearCliente, elementoDe, nombres, prepararEquipo, registrar, subir } from './ayudantes.js';

describe('votaciones de los espacios compartidos', () => {
  let equipo;
  let ana;
  let bea;
  let cata;
  let espacio;
  let raiz;

  beforeEach(async () => {
    equipo = await prepararEquipo();
    ({ ana, bea, cata, espacio } = equipo);
    raiz = espacio.raizId;
  });

  afterEach(async () => {
    await equipo.servidor.cerrar();
  });

  function proponer(cliente, datos) {
    return cliente.pedir('POST', `/api/espacios/${espacio.id}/propuestas`, datos);
  }

  function votar(cliente, propuestaId, voto) {
    return cliente.pedir('POST', `/api/propuestas/${propuestaId}/voto`, { voto });
  }

  async function papelera(cliente) {
    return (await cliente.pedir('GET', `/api/espacios/${espacio.id}/papelera`)).cuerpo.elementos.map((e) => e.nombre);
  }

  // Envía elementos a la papelera del espacio con el voto de todos.
  async function eliminarConVotos(ids) {
    const { propuesta } = (await proponer(ana, { tipo: 'eliminar', ids })).cuerpo;
    await votar(bea, propuesta.id, 'si');
    await votar(cata, propuesta.id, 'si');
  }

  test('eliminar necesita el sí de todos; un "no" se puede cambiar', async () => {
    const archivo = (await subir(bea, raiz, 'borrador.txt', 'x')).cuerpo.elemento;

    const creada = await proponer(ana, { tipo: 'eliminar', ids: [archivo.id], motivo: '  Ya no se usa  ' });
    assert.equal(creada.estado, 201);
    const { propuesta } = creada.cuerpo;
    assert.equal(propuesta.estado, 'ABIERTA');
    assert.equal(propuesta.motivo, 'Ya no se usa');
    assert.equal(propuesta.miVoto, 'SI');
    assert.deepEqual(propuesta.recuento, { si: 1, no: 0, pendientes: 2, total: 3 });
    assert.deepEqual(propuesta.elementos, [{ id: archivo.id, nombre: 'borrador.txt', tipo: 'ARCHIVO' }]);

    const marcado = await elementoDe(bea, raiz, 'borrador.txt');
    assert.deepEqual(marcado.propuestaPendiente, { id: propuesta.id, tipo: 'ELIMINAR' });
    assert.equal((await bea.pedir('PATCH', `/api/nodos/${archivo.id}`, { nombre: 'borrador viejo.txt' })).estado, 200);

    const aviso = (await avisos(bea)).find((a) => a.tipo === 'VOTO_PENDIENTE');
    assert.equal(aviso.datos.motivo, 'Ya no se usa');
    assert.equal(aviso.datos.propuestoPor, 'Ana');
    assert.equal((await bea.pedir('GET', '/api/propuestas/pendientes')).cuerpo.propuestas.length, 1);

    assert.equal((await votar(bea, propuesta.id, 'si')).cuerpo.propuesta.estado, 'ABIERTA');
    const conNo = (await votar(cata, propuesta.id, 'no')).cuerpo.propuesta;
    assert.equal(conNo.estado, 'ABIERTA');
    assert.deepEqual(conNo.recuento, { si: 2, no: 1, pendientes: 0, total: 3 });

    const aprobada = (await votar(cata, propuesta.id, 'si')).cuerpo.propuesta;
    assert.equal(aprobada.estado, 'APROBADA');
    assert.equal(aprobada.puedoVotar, false);
    assert.deepEqual(await nombres(ana, raiz), []);
    assert.deepEqual(await papelera(bea), ['borrador viejo.txt']);
    assert.equal((await votar(cata, propuesta.id, 'no')).estado, 409);
    assert.ok((await avisos(ana)).some((a) => a.tipo === 'PROPUESTA_APROBADA'));
  });

  test('restaurar y eliminar definitivamente también se votan', async () => {
    const docs = await crearCarpeta(ana, raiz, 'Docs');
    const archivo = (await subir(bea, docs, 'acta.txt', 'contenido')).cuerpo.elemento;
    await eliminarConVotos([archivo.id]);

    const directo = await bea.pedir('POST', '/api/papelera/restaurar', { ids: [archivo.id] });
    assert.equal(directo.estado, 409);

    const restaurar = (await proponer(bea, { tipo: 'restaurar', ids: [archivo.id] })).cuerpo.propuesta;
    await votar(ana, restaurar.id, 'si');
    await votar(cata, restaurar.id, 'si');
    assert.deepEqual(await nombres(cata, docs), ['acta.txt']);

    await eliminarConVotos([archivo.id]);
    const vaciar = (await proponer(cata, { tipo: 'eliminar_definitivo', todos: true })).cuerpo.propuesta;
    assert.equal(vaciar.elementos.length, 1);
    await votar(ana, vaciar.id, 'si');
    assert.equal(contar(equipo.db, 'fragmentos'), 1);
    await votar(bea, vaciar.id, 'si');
    assert.deepEqual(await papelera(ana), []);
    assert.equal(contar(equipo.db, 'fragmentos'), 0);
  });

  test('no se puede proponer dos veces lo mismo ni votar en Mi espacio', async () => {
    const archivo = (await subir(bea, raiz, 'a.txt', 'x')).cuerpo.elemento;
    await proponer(ana, { tipo: 'eliminar', ids: [archivo.id] });
    assert.equal((await proponer(bea, { tipo: 'eliminar', ids: [archivo.id] })).estado, 409);
    assert.equal((await proponer(ana, { tipo: 'restaurar', ids: [archivo.id] })).estado, 404);
    assert.equal((await proponer(ana, { tipo: 'eliminar', todos: true })).estado, 400);
    assert.equal((await proponer(ana, { tipo: 'otra', ids: [archivo.id] })).estado, 400);
    assert.equal((await proponer(ana, { tipo: 'eliminar', ids: [raiz] })).cuerpo.codigo, 'REGLA_NEGOCIO');

    const personal = equipo.usuarios.ana.usuario;
    const enMiEspacio = await ana.pedir('POST', `/api/espacios/${personal.espacioId}/propuestas`, { tipo: 'eliminar', ids: [] });
    assert.equal(enMiEspacio.cuerpo.codigo, 'REGLA_NEGOCIO');
    assert.equal(enMiEspacio.cuerpo.mensaje, 'En Mi espacio no hace falta votar');
  });

  test('sin unanimidad en 7 días la propuesta vence y se rechaza', async () => {
    const archivo = (await subir(bea, raiz, 'a.txt', 'x')).cuerpo.elemento;
    const { propuesta } = (await proponer(ana, { tipo: 'eliminar', ids: [archivo.id] })).cuerpo;
    await votar(bea, propuesta.id, 'si');

    equipo.db.prepare(`UPDATE propuestas SET expira_en = '2000-01-01T00:00:00.000Z' WHERE id = ?`).run(propuesta.id);

    assert.equal((await elementoDe(bea, raiz, 'a.txt')).propuestaPendiente, null);
    const vencida = (await ana.pedir('GET', `/api/propuestas/${propuesta.id}`)).cuerpo.propuesta;
    assert.equal(vencida.estado, 'VENCIDA');
    assert.ok(vencida.cerradaEn);
    assert.equal((await votar(cata, propuesta.id, 'si')).estado, 409);
    assert.ok(await elementoDe(ana, raiz, 'a.txt'));
    assert.ok((await avisos(ana)).some((a) => a.tipo === 'PROPUESTA_VENCIDA'));

    const historial = (await ana.pedir('GET', `/api/espacios/${espacio.id}/propuestas?estado=cerradas`)).cuerpo.propuestas;
    assert.deepEqual(historial.map((p) => p.estado), ['VENCIDA']);
    assert.deepEqual((await ana.pedir('GET', `/api/espacios/${espacio.id}/propuestas`)).cuerpo.propuestas, []);
  });

  test('un día antes de vencer se avisa una sola vez a quien no votó que sí', async () => {
    const archivo = (await subir(bea, raiz, 'a.txt', 'x')).cuerpo.elemento;
    const { propuesta } = (await proponer(ana, { tipo: 'eliminar', ids: [archivo.id] })).cuerpo;
    await votar(bea, propuesta.id, 'si');
    const pronto = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    equipo.db.prepare('UPDATE propuestas SET expira_en = ? WHERE id = ?').run(pronto, propuesta.id);

    equipo.servidor.servicios.propuestas.avisarPorVencer();
    equipo.servidor.servicios.propuestas.avisarPorVencer();

    const porVencer = (lista) => lista.filter((a) => a.tipo === 'PROPUESTA_POR_VENCER');
    assert.equal(porVencer(await avisos(cata)).length, 1);
    assert.equal(porVencer(await avisos(bea)).length, 0);
    assert.equal(porVencer(await avisos(ana)).length, 0);
  });

  test('solo quien propone puede retirar la propuesta', async () => {
    const archivo = (await subir(bea, raiz, 'a.txt', 'x')).cuerpo.elemento;
    const { propuesta } = (await proponer(ana, { tipo: 'eliminar', ids: [archivo.id] })).cuerpo;
    assert.equal((await bea.pedir('POST', `/api/propuestas/${propuesta.id}/retirar`)).estado, 403);
    const retirada = await ana.pedir('POST', `/api/propuestas/${propuesta.id}/retirar`);
    assert.equal(retirada.cuerpo.propuesta.estado, 'RETIRADA');
    assert.equal((await proponer(bea, { tipo: 'eliminar', ids: [archivo.id] })).estado, 201);
  });

  test('votan los miembros que había al proponer y quien sale deja de contar', async () => {
    const archivo = (await subir(bea, raiz, 'a.txt', 'x')).cuerpo.elemento;
    const { propuesta } = (await proponer(ana, { tipo: 'eliminar', ids: [archivo.id] })).cuerpo;

    const dani = crearCliente(equipo.servidor.url);
    await registrar(dani, 'dani@deskcloud.test');
    await ana.pedir('POST', `/api/espacios/${espacio.id}/invitaciones`, { correo: 'dani@deskcloud.test' });
    const [invitacion] = (await dani.pedir('GET', '/api/invitaciones')).cuerpo.invitaciones;
    await dani.pedir('POST', `/api/invitaciones/${invitacion.id}/aceptar`);
    assert.equal((await votar(dani, propuesta.id, 'si')).estado, 403);
    assert.equal((await dani.pedir('GET', `/api/propuestas/${propuesta.id}`)).cuerpo.propuesta.puedoVotar, false);

    await votar(bea, propuesta.id, 'si');
    await cata.pedir('POST', `/api/espacios/${espacio.id}/salir`);
    const final = (await ana.pedir('GET', `/api/propuestas/${propuesta.id}`)).cuerpo.propuesta;
    assert.equal(final.estado, 'APROBADA');
    assert.equal(final.recuento.total, 2);
    assert.deepEqual(await papelera(dani), ['a.txt']);
  });

  test('con un solo miembro la propuesta se aprueba al instante', async () => {
    await bea.pedir('POST', `/api/espacios/${espacio.id}/salir`);
    await cata.pedir('POST', `/api/espacios/${espacio.id}/salir`);
    const archivo = (await subir(ana, raiz, 'a.txt', 'x')).cuerpo.elemento;
    const { propuesta } = (await proponer(ana, { tipo: 'eliminar', ids: [archivo.id] })).cuerpo;
    assert.equal(propuesta.estado, 'APROBADA');
    assert.deepEqual(await papelera(ana), ['a.txt']);
  });
});
