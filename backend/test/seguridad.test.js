import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { crearBaseDatosPrueba, crearCliente, iniciarServidorPrueba, registrar } from './ayudantes.js';

describe('límite de intentos de inicio de sesión', () => {
  let servidor;
  let cliente;

  beforeEach(async () => {
    servidor = await iniciarServidorPrueba(crearBaseDatosPrueba());
    cliente = crearCliente(servidor.url);
    await registrar(cliente, 'ana@deskcloud.test');
  });

  afterEach(async () => {
    await servidor.cerrar();
  });

  const login = (correo, contrasena) => cliente.pedir('POST', '/api/auth/login', { correo, contrasena });

  test('tras 5 fallos para la misma cuenta bloquea aunque la contraseña sea correcta', async () => {
    for (let i = 0; i < 5; i++) {
      assert.equal((await login('ana@deskcloud.test', 'incorrecta-123')).estado, 401);
    }
    const bloqueado = await login('ANA@deskcloud.test', 'clave-segura-123');
    assert.equal(bloqueado.estado, 429);
    assert.equal(bloqueado.cuerpo.codigo, 'DEMASIADOS_INTENTOS');
    assert.ok(Number(bloqueado.cabeceras.get('retry-after')) > 0);
    assert.ok(bloqueado.cuerpo.detalles.reintentarEnSegundos <= 15 * 60);

    await registrar(crearCliente(servidor.url), 'bea@deskcloud.test');
    assert.equal((await login('bea@deskcloud.test', 'clave-segura-123')).estado, 200);
  });

  test('un inicio de sesión correcto reinicia el conteo de la cuenta', async () => {
    for (let i = 0; i < 4; i++) await login('ana@deskcloud.test', 'incorrecta-123');
    assert.equal((await login('ana@deskcloud.test', 'clave-segura-123')).estado, 200);
    for (let i = 0; i < 4; i++) await login('ana@deskcloud.test', 'incorrecta-123');
    assert.equal((await login('ana@deskcloud.test', 'incorrecta-123')).estado, 401);
  });

  test('tras 20 fallos desde la misma IP bloquea cualquier correo', async () => {
    for (let i = 0; i < 20; i++) {
      assert.equal((await login(`persona${i}@deskcloud.test`, 'incorrecta-123')).estado, 401);
    }
    assert.equal((await login('ana@deskcloud.test', 'clave-segura-123')).estado, 429);
  });

  test('los datos incompletos no cuentan como intento', async () => {
    for (let i = 0; i < 6; i++) {
      assert.equal((await login('ana@deskcloud.test', '')).estado, 400);
    }
    assert.equal((await login('ana@deskcloud.test', 'clave-segura-123')).estado, 200);
  });
});

describe('verificación de origen', () => {
  let servidor;
  let cliente;

  beforeEach(async () => {
    servidor = await iniciarServidorPrueba(crearBaseDatosPrueba(), { origenesPermitidos: ['http://localhost:4200'] });
    cliente = crearCliente(servidor.url);
    await registrar(cliente, 'ana@deskcloud.test');
  });

  afterEach(async () => {
    await servidor.cerrar();
  });

  test('rechaza cambios pedidos desde otro sitio y permite los propios', async () => {
    const raizId = (await cliente.pedir('GET', '/api/auth/me')).cuerpo.usuario.raizId;
    const crearCarpeta = (cabeceras) =>
      cliente.pedir('POST', `/api/nodos/${raizId}/carpetas`, { nombre: `C${Math.random()}` }, { cabeceras });

    const ajeno = await crearCarpeta({ Origin: 'https://malicioso.test' });
    assert.equal(ajeno.estado, 403);
    assert.equal(ajeno.cuerpo.codigo, 'ORIGEN_NO_PERMITIDO');
    assert.equal((await crearCarpeta({ 'Sec-Fetch-Site': 'cross-site' })).estado, 403);

    assert.equal((await crearCarpeta({ Origin: servidor.url })).estado, 201);
    assert.equal((await crearCarpeta({ Origin: 'http://localhost:4200' })).estado, 201);
    assert.equal((await crearCarpeta({ 'Sec-Fetch-Site': 'same-origin' })).estado, 201);
    assert.equal((await crearCarpeta({})).estado, 201);

    const lectura = await cliente.pedir('GET', `/api/nodos/${raizId}/contenido`, undefined, {
      cabeceras: { Origin: 'https://malicioso.test' },
    });
    assert.equal(lectura.estado, 200);
  });

  test('tampoco se puede iniciar sesión desde otro sitio', async () => {
    const respuesta = await cliente.pedir(
      'POST',
      '/api/auth/login',
      { correo: 'ana@deskcloud.test', contrasena: 'clave-segura-123' },
      { cabeceras: { Origin: 'https://malicioso.test' } },
    );
    assert.equal(respuesta.estado, 403);
  });
});

describe('frontend compilado', () => {
  let carpeta;
  let servidor;

  beforeEach(async () => {
    carpeta = mkdtempSync(path.join(tmpdir(), 'deskcloud-frontend-'));
    writeFileSync(path.join(carpeta, 'index.html'), '<!doctype html><title>DeskCloud</title>');
    writeFileSync(path.join(carpeta, 'main.js'), 'console.log(1)');
    servidor = await iniciarServidorPrueba(crearBaseDatosPrueba(), { rutaFrontend: carpeta });
  });

  afterEach(async () => {
    await servidor.cerrar();
    rmSync(carpeta, { recursive: true, force: true });
  });

  test('sirve los archivos, devuelve index.html en las rutas de Angular y deja /api intacta', async () => {
    const cliente = crearCliente(servidor.url);
    const inicio = await cliente.pedir('GET', '/');
    assert.equal(inicio.estado, 200);
    assert.match(inicio.datos.toString(), /DeskCloud/);
    assert.equal(inicio.cabeceras.get('x-frame-options'), 'SAMEORIGIN');

    assert.match((await cliente.pedir('GET', '/espacios/3/carpeta/7')).datos.toString(), /DeskCloud/);
    assert.equal((await cliente.pedir('GET', '/main.js')).datos.toString(), 'console.log(1)');

    const api = await cliente.pedir('GET', '/api/no-existe');
    assert.equal(api.estado, 404);
    assert.equal(api.cuerpo.codigo, 'RUTA_NO_ENCONTRADA');
  });

  test('sin frontend compilado solo responde la API', async () => {
    const otro = await iniciarServidorPrueba(crearBaseDatosPrueba(), { rutaFrontend: path.join(carpeta, 'no-existe') });
    try {
      assert.equal((await crearCliente(otro.url).pedir('GET', '/')).estado, 404);
    } finally {
      await otro.cerrar();
    }
  });
});
