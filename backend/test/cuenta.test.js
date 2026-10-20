import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { contar, crearCliente, prepararEquipo, subir } from './ayudantes.js';

const CLAVE = 'clave-segura-123';

describe('cuenta y sesiones', () => {
  let equipo;
  let ana;

  beforeEach(async () => {
    equipo = await prepararEquipo();
    ana = equipo.ana;
  });

  afterEach(async () => {
    await equipo.servidor.cerrar();
  });

  async function otraSesion(correo = 'ana@deskcloud.test', contrasena = CLAVE) {
    const cliente = crearCliente(equipo.servidor.url);
    const respuesta = await cliente.pedir('POST', '/api/auth/login', { correo, contrasena });
    return { cliente, estado: respuesta.estado };
  }

  const sigueConectado = async (cliente) => (await cliente.pedir('GET', '/api/auth/me')).estado === 200;

  test('cambia el nombre', async () => {
    const { cuerpo } = await ana.pedir('PATCH', '/api/cuenta', { nombre: '  Ana María ' });
    assert.equal(cuerpo.usuario.nombre, 'Ana María');
    assert.equal((await ana.pedir('GET', '/api/auth/me')).cuerpo.usuario.nombre, 'Ana María');
    assert.equal((await ana.pedir('PATCH', '/api/cuenta', { nombre: '' })).estado, 400);
    assert.equal((await ana.pedir('PATCH', '/api/cuenta', { nombre: 'x'.repeat(81) })).estado, 400);
  });

  test('cambiar la contraseña pide la actual y cierra las demás sesiones', async () => {
    const { cliente: celular } = await otraSesion();

    const incorrecta = await ana.pedir('PUT', '/api/cuenta/contrasena', { actual: 'otra-clave-123', nueva: 'nueva-clave-456' });
    assert.equal(incorrecta.estado, 400);
    assert.ok(incorrecta.cuerpo.detalles.actual);
    const corta = await ana.pedir('PUT', '/api/cuenta/contrasena', { actual: CLAVE, nueva: 'corta' });
    assert.ok(corta.cuerpo.detalles.nueva);

    const cambio = await ana.pedir('PUT', '/api/cuenta/contrasena', { actual: CLAVE, nueva: 'nueva-clave-456' });
    assert.deepEqual(cambio.cuerpo, { sesionesCerradas: 1 });
    assert.equal(await sigueConectado(ana), true);
    assert.equal(await sigueConectado(celular), false);

    assert.equal((await otraSesion('ana@deskcloud.test', CLAVE)).estado, 401);
    assert.equal((await otraSesion('ana@deskcloud.test', 'nueva-clave-456')).estado, 200);
  });

  test('lista las sesiones activas y permite cerrarlas', async () => {
    const { cliente: celular } = await otraSesion();
    const { cliente: tablet } = await otraSesion();

    const { sesiones } = (await ana.pedir('GET', '/api/cuenta/sesiones')).cuerpo;
    assert.equal(sesiones.length, 3);
    assert.equal(sesiones.filter((s) => s.actual).length, 1);
    for (const sesion of sesiones) {
      assert.match(sesion.id, /^[0-9a-f]{16}$/);
      assert.ok(sesion.creadaEn);
      assert.ok(sesion.ultimoUso);
      assert.equal(typeof sesion.navegador, 'string');
    }

    const actual = sesiones.find((s) => s.actual);
    assert.equal((await ana.pedir('DELETE', `/api/cuenta/sesiones/${actual.id}`)).estado, 400);
    assert.equal((await ana.pedir('DELETE', '/api/cuenta/sesiones/0000000000000000')).estado, 404);

    const idCelular = (await celular.pedir('GET', '/api/cuenta/sesiones')).cuerpo.sesiones.find((s) => s.actual).id;
    assert.equal((await equipo.bea.pedir('DELETE', `/api/cuenta/sesiones/${idCelular}`)).estado, 404);
    const restantes = (await ana.pedir('DELETE', `/api/cuenta/sesiones/${idCelular}`)).cuerpo.sesiones;
    assert.equal(restantes.length, 2);
    assert.equal(await sigueConectado(celular), false);

    assert.deepEqual((await ana.pedir('POST', '/api/cuenta/sesiones/cerrar-otras')).cuerpo, { sesionesCerradas: 1 });
    assert.equal(await sigueConectado(tablet), false);
    assert.equal(await sigueConectado(ana), true);
    assert.equal(await sigueConectado(equipo.bea), true);
  });

  test('eliminar la cuenta pide la contraseña, borra Mi espacio y sale de los espacios compartidos', async () => {
    const raizAna = equipo.usuarios.ana.usuario.raizId;
    await subir(ana, raizAna, 'propio.txt', 'mio');
    await subir(ana, equipo.espacio.raizId, 'del equipo.txt', 'equipo');
    const soloAna = (await ana.pedir('POST', '/api/espacios', { nombre: 'Solo mío' })).cuerpo.espacio;
    await subir(ana, soloAna.raizId, 'privado.txt', 'privado');
    const { cliente: celular } = await otraSesion();

    const sinClave = await ana.pedir('DELETE', '/api/cuenta', { contrasena: 'otra-clave-123' });
    assert.equal(sinClave.estado, 400);
    assert.ok(sinClave.cuerpo.detalles.contrasena);

    const eliminada = await ana.pedir('DELETE', '/api/cuenta', { contrasena: CLAVE });
    assert.equal(eliminada.estado, 204);
    assert.equal(ana.cookie, null);
    assert.equal(await sigueConectado(celular), false);
    assert.equal((await otraSesion()).estado, 401);

    const { espacio, miembros } = (await equipo.bea.pedir('GET', `/api/espacios/${equipo.espacio.id}`)).cuerpo;
    assert.equal(espacio.esAdministrador, true);
    assert.deepEqual(miembros.map((m) => m.nombre), ['Bea', 'Cata']);
    assert.equal(contar(equipo.db, 'fragmentos'), 1);
    assert.equal(contar(equipo.db, 'sesiones'), 2);
    assert.equal(equipo.db.prepare('SELECT COUNT(*) AS total FROM espacios WHERE id = ?').get(soloAna.id).total, 0);

    const subido = (await equipo.bea.pedir('GET', `/api/nodos/${equipo.espacio.raizId}/contenido`)).cuerpo.elementos[0];
    assert.equal(subido.nombre, 'del equipo.txt');
  });
});
