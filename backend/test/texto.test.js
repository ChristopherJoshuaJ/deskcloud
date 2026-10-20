import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { crearCliente, prepararEspacio, registrar, subir } from './ayudantes.js';

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);

describe('edición de texto', () => {
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

  async function subirTexto(nombre, datos, tipo = 'text/plain') {
    return (await subir(ana, documentos, nombre, datos, { tipo })).cuerpo.elemento;
  }

  function leer(id, cliente = ana) {
    return cliente.pedir('GET', `/api/nodos/${id}/texto`);
  }

  function guardar(id, texto, { sha256, tipo = 'text/plain; charset=utf-8', cliente = ana } = {}) {
    const cabeceras = sha256 === undefined ? {} : { 'If-Match': sha256 === '*' ? '*' : `"${sha256}"` };
    const cuerpo = Buffer.isBuffer(texto) ? texto : Buffer.from(texto);
    return cliente.pedir('PUT', `/api/nodos/${id}/texto`, cuerpo, { tipo, cabeceras });
  }

  test('lee el texto con la versión que se está editando', async () => {
    const notas = await subirTexto('notas.txt', 'hola\r\nmundo ñandú');
    assert.equal(notas.esTextoEditable, true);

    const { estado, cuerpo } = await leer(notas.id);
    assert.equal(estado, 200);
    assert.equal(cuerpo.texto, 'hola\r\nmundo ñandú');
    assert.equal(cuerpo.version.numero, 1);
    assert.match(cuerpo.version.sha256, /^[0-9a-f]{64}$/);
  });

  test('cada guardado crea una versión nueva', async () => {
    const notas = await subirTexto('notas.md', '# Título', 'text/markdown');
    const { version } = (await leer(notas.id)).cuerpo;

    const guardado = await guardar(notas.id, '# Título\n\nCon más contenido', { sha256: version.sha256 });
    assert.equal(guardado.estado, 201);
    assert.equal(guardado.cuerpo.accion, 'guardado');
    assert.equal(guardado.cuerpo.version.numero, 2);
    assert.equal(guardado.cuerpo.elemento.version, 2);
    assert.equal(guardado.cuerpo.elemento.mime, 'text/markdown');

    assert.equal((await leer(notas.id)).cuerpo.texto, '# Título\n\nCon más contenido');
    const { versiones } = (await ana.pedir('GET', `/api/nodos/${notas.id}/versiones`)).cuerpo;
    assert.deepEqual(versiones.map((v) => v.numero), [2, 1]);
  });

  test('no pisa cambios guardados por otra persona o en otra pestaña', async () => {
    const notas = await subirTexto('notas.txt', 'original');
    const abierto = (await leer(notas.id)).cuerpo.version;

    assert.equal((await guardar(notas.id, 'sin versión')).estado, 428);

    await guardar(notas.id, 'desde otra pestaña', { sha256: abierto.sha256 });
    const tarde = await guardar(notas.id, 'cambios viejos', { sha256: abierto.sha256 });
    assert.equal(tarde.estado, 412);
    assert.equal(tarde.cuerpo.codigo, 'VERSION_DESACTUALIZADA');
    assert.equal(tarde.cuerpo.detalles.versionActual.numero, 2);
    assert.equal((await leer(notas.id)).cuerpo.texto, 'desde otra pestaña');

    const forzado = await guardar(notas.id, 'sobrescrito a propósito', { sha256: '*' });
    assert.equal(forzado.cuerpo.version.numero, 3);
    assert.equal((await leer(notas.id)).cuerpo.texto, 'sobrescrito a propósito');
  });

  test('guardar sin cambios no crea una versión', async () => {
    const notas = await subirTexto('notas.txt', 'igual');
    const { version } = (await leer(notas.id)).cuerpo;

    const { estado, cuerpo } = await guardar(notas.id, 'igual', { sha256: version.sha256 });
    assert.equal(estado, 200);
    assert.equal(cuerpo.accion, 'sin-cambios');
    assert.equal(cuerpo.version.numero, 1);
  });

  test('conserva el BOM de los archivos que lo tenían', async () => {
    const notas = await subirTexto('bloc.txt', Buffer.concat([BOM, Buffer.from('hola')]));
    const { texto, version } = (await leer(notas.id)).cuerpo;
    assert.equal(texto, 'hola');

    await guardar(notas.id, 'adiós', { sha256: version.sha256 });
    const descarga = await ana.pedir('GET', `/api/nodos/${notas.id}/descarga`);
    assert.deepEqual(descarga.datos, Buffer.concat([BOM, Buffer.from('adiós')]));
  });

  test('un documento nuevo se crea subiendo un archivo vacío', async () => {
    const nuevo = await subirTexto('Nuevo documento.txt', Buffer.alloc(0));
    assert.equal(nuevo.tamano, 0);
    const { texto, version } = (await leer(nuevo.id)).cuerpo;
    assert.equal(texto, '');

    const guardado = await guardar(nuevo.id, 'primer párrafo', { sha256: version.sha256 });
    assert.equal(guardado.cuerpo.version.numero, 2);
  });

  test('solo se editan textos en UTF-8', async () => {
    const imagen = await subirTexto('foto.png', randomBytes(50), 'image/png');
    assert.equal(imagen.esTextoEditable, false);
    assert.equal((await leer(imagen.id)).cuerpo.codigo, 'NO_EDITABLE');

    const latin1 = await subirTexto('viejo.txt', Buffer.from([0x63, 0x61, 0xf1, 0x61]));
    const lectura = await leer(latin1.id);
    assert.equal(lectura.estado, 415);
    assert.equal(lectura.cuerpo.codigo, 'NO_EDITABLE');

    const notas = await subirTexto('notas.txt', 'ok');
    const { version } = (await leer(notas.id)).cuerpo;
    const binario = await guardar(notas.id, Buffer.from([0xff, 0xfe, 0x00]), { sha256: version.sha256 });
    assert.equal(binario.cuerpo.codigo, 'NO_EDITABLE');
    const comoJson = await guardar(notas.id, '{"texto":"x"}', { sha256: version.sha256, tipo: 'application/json' });
    assert.equal(comoJson.cuerpo.codigo, 'TIPO_NO_SOPORTADO');
    const otroCharset = await guardar(notas.id, 'x', { sha256: version.sha256, tipo: 'text/plain; charset=iso-8859-1' });
    assert.equal(otroCharset.cuerpo.codigo, 'TIPO_NO_SOPORTADO');
    assert.equal((await leer(notas.id)).cuerpo.texto, 'ok');
  });

  test('rechaza documentos de más de 5 MB', async () => {
    const notas = await subirTexto('notas.txt', 'corto');
    const { version } = (await leer(notas.id)).cuerpo;
    const enorme = Buffer.alloc(5 * 1024 * 1024 + 1, 'a');

    const respuesta = await guardar(notas.id, enorme, { sha256: version.sha256 });
    assert.equal(respuesta.estado, 413);
    assert.equal((await leer(notas.id)).cuerpo.texto, 'corto');
  });

  test('ni carpetas ni archivos ajenos', async () => {
    const notas = await subirTexto('notas.txt', 'privado');
    const { version } = (await leer(notas.id)).cuerpo;
    assert.equal((await leer(documentos)).estado, 400);

    const bea = crearCliente(entorno.servidor.url);
    await registrar(bea, 'bea@deskcloud.test');
    assert.equal((await leer(notas.id, bea)).estado, 404);
    assert.equal((await guardar(notas.id, 'hackeado', { sha256: version.sha256, cliente: bea })).estado, 404);
    assert.equal((await leer(notas.id)).cuerpo.texto, 'privado');
  });

  test('un JSON demasiado grande responde 413 y no 500', async () => {
    const grande = { nombre: 'x'.repeat(200 * 1024) };
    const respuesta = await ana.pedir('POST', `/api/nodos/${documentos}/carpetas`, grande);
    assert.equal(respuesta.estado, 413);
    assert.equal(respuesta.cuerpo.codigo, 'CONTENIDO_DEMASIADO_GRANDE');
  });
});
