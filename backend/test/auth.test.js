import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { CARPETAS_SUGERIDAS } from '../src/services/espacioService.js';
import { contar, crearBaseDatosPrueba, crearCliente, iniciarServidorPrueba } from './ayudantes.js';

const ANA = { nombre: 'Ana Pérez', correo: 'Ana@DeskCloud.test', contrasena: 'clave-segura-123' };

describe('registro e inicio de sesión', () => {
  let db;
  let servidor;
  let cliente;

  beforeEach(async () => {
    db = crearBaseDatosPrueba();
    servidor = await iniciarServidorPrueba(db);
    cliente = crearCliente(servidor.url);
  });

  afterEach(async () => {
    await servidor.cerrar();
  });

  test('el registro crea la cuenta, su espacio y deja la sesión abierta', async () => {
    const { estado, cuerpo, setCookie } = await cliente.pedir('POST', '/api/auth/registro', ANA);

    assert.equal(estado, 201);
    assert.equal(cuerpo.usuario.nombre, 'Ana Pérez');
    assert.equal(cuerpo.usuario.correo, 'ana@deskcloud.test');
    assert.equal(typeof cuerpo.usuario.raizId, 'number');
    assert.equal(cuerpo.usuario.hashContrasena, undefined);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);

    const carpetas = db
      .prepare(`SELECT nombre FROM nodos WHERE padre_id = ? ORDER BY id`)
      .all(cuerpo.usuario.raizId)
      .map((fila) => fila.nombre);
    assert.deepEqual(carpetas, CARPETAS_SUGERIDAS);

    const accesos = db
      .prepare(`SELECT n.nombre FROM favoritos f JOIN nodos n ON n.id = f.nodo_id WHERE f.usuario_id = ? ORDER BY f.orden`)
      .all(cuerpo.usuario.id)
      .map((fila) => fila.nombre);
    assert.deepEqual(accesos, CARPETAS_SUGERIDAS);

    const { hash } = db.prepare('SELECT hash_contrasena AS hash FROM usuarios').get();
    assert.match(hash, /^scrypt\$/);
    assert.ok(!hash.includes(ANA.contrasena));

    const me = await cliente.pedir('GET', '/api/auth/me');
    assert.equal(me.estado, 200);
    assert.equal(me.cuerpo.usuario.id, cuerpo.usuario.id);
  });

  test('sin sesión no se puede consultar el usuario actual', async () => {
    const { estado, cuerpo } = await cliente.pedir('GET', '/api/auth/me');
    assert.equal(estado, 401);
    assert.equal(cuerpo.codigo, 'NO_AUTENTICADO');
  });

  test('no permite dos cuentas con el mismo correo', async () => {
    await cliente.pedir('POST', '/api/auth/registro', ANA);
    const otro = crearCliente(servidor.url);
    const { estado, cuerpo } = await otro.pedir('POST', '/api/auth/registro', { ...ANA, correo: 'ana@deskcloud.TEST' });

    assert.equal(estado, 409);
    assert.equal(cuerpo.codigo, 'CONFLICTO');
    assert.equal(contar(db, 'usuarios'), 1);
    assert.equal(otro.cookie, null);
  });

  test('valida los datos del registro', async () => {
    const { estado, cuerpo } = await cliente.pedir('POST', '/api/auth/registro', {
      nombre: '   ',
      correo: 'sin-arroba',
      contrasena: 'corta',
    });

    assert.equal(estado, 400);
    assert.equal(cuerpo.codigo, 'DATOS_INVALIDOS');
    assert.deepEqual(Object.keys(cuerpo.detalles).sort(), ['contrasena', 'correo', 'nombre']);
    assert.equal(contar(db, 'usuarios'), 0);

    const malformado = await cliente.pedir('POST', '/api/auth/registro', '{"nombre":');
    assert.equal(malformado.estado, 400);
    assert.equal(malformado.cuerpo.codigo, 'JSON_INVALIDO');
  });

  test('el login falla igual con contraseña incorrecta o correo inexistente', async () => {
    await cliente.pedir('POST', '/api/auth/registro', ANA);
    const anonimo = crearCliente(servidor.url);

    const claveMala = await anonimo.pedir('POST', '/api/auth/login', { correo: ANA.correo, contrasena: 'otra-clave-999' });
    const correoMalo = await anonimo.pedir('POST', '/api/auth/login', { correo: 'nadie@deskcloud.test', contrasena: ANA.contrasena });

    assert.equal(claveMala.estado, 401);
    assert.equal(correoMalo.estado, 401);
    assert.deepEqual(claveMala.cuerpo, correoMalo.cuerpo);
    assert.equal(anonimo.cookie, null);
  });

  test('el login correcto abre una sesión nueva e invalida la anterior', async () => {
    await cliente.pedir('POST', '/api/auth/registro', ANA);
    const cookieAnterior = cliente.cookie;

    const { estado, cuerpo } = await cliente.pedir('POST', '/api/auth/login', {
      correo: ' ana@deskcloud.test ',
      contrasena: ANA.contrasena,
    });
    assert.equal(estado, 200);
    assert.equal(cuerpo.usuario.correo, 'ana@deskcloud.test');
    assert.notEqual(cliente.cookie, cookieAnterior);

    const conCookieAnterior = crearCliente(servidor.url);
    conCookieAnterior.cookie = cookieAnterior;
    assert.equal((await conCookieAnterior.pedir('GET', '/api/auth/me')).estado, 401);
    assert.equal((await cliente.pedir('GET', '/api/auth/me')).estado, 200);
  });

  test('el logout cierra la sesión', async () => {
    await cliente.pedir('POST', '/api/auth/registro', ANA);
    const cookie = cliente.cookie;

    const { estado } = await cliente.pedir('POST', '/api/auth/logout');
    assert.equal(estado, 204);
    assert.equal(cliente.cookie, null);
    assert.equal(contar(db, 'sesiones'), 0);

    cliente.cookie = cookie;
    assert.equal((await cliente.pedir('GET', '/api/auth/me')).estado, 401);
  });

  test('la sesión sobrevive a un reinicio del servidor', async () => {
    await cliente.pedir('POST', '/api/auth/registro', ANA);
    await servidor.cerrar();

    servidor = await iniciarServidorPrueba(db);
    const reconectado = crearCliente(servidor.url);
    reconectado.cookie = cliente.cookie;
    assert.equal((await reconectado.pedir('GET', '/api/auth/me')).estado, 200);
  });

  test('una sesión expirada ya no sirve', async () => {
    await cliente.pedir('POST', '/api/auth/registro', ANA);
    db.prepare('UPDATE sesiones SET expira_en = ?').run(Date.now() - 1000);

    assert.equal((await cliente.pedir('GET', '/api/auth/me')).estado, 401);
  });

  test('si la cuenta se elimina, su sesión deja de funcionar', async () => {
    await cliente.pedir('POST', '/api/auth/registro', ANA);
    db.prepare('DELETE FROM usuarios').run();

    assert.equal((await cliente.pedir('GET', '/api/auth/me')).estado, 401);
    assert.equal(contar(db, 'nodos'), 0);
  });
});
