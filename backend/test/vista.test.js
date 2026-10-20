import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import http from 'node:http';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { leerRango } from '../src/http/enviarVersion.js';
import { crearCliente, prepararEspacio, registrar, subir } from './ayudantes.js';

describe('vista previa', () => {
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

  async function subirArchivo(nombre, datos, tipo) {
    return (await subir(ana, documentos, nombre, datos, { tipo })).cuerpo.elemento;
  }

  function vista(id, cabeceras) {
    return ana.pedir('GET', `/api/nodos/${id}/vista`, undefined, { cabeceras });
  }

  test('muestra imágenes en línea y protegidas', async () => {
    const imagen = await subirArchivo('foto.png', randomBytes(100), 'image/png');
    assert.equal(imagen.tipoVista, 'imagen');

    const respuesta = await vista(imagen.id);
    assert.equal(respuesta.estado, 200);
    assert.equal(respuesta.cabeceras.get('content-type'), 'image/png');
    assert.match(respuesta.cabeceras.get('content-disposition'), /^inline;/);
    assert.match(respuesta.cabeceras.get('content-security-policy'), /sandbox/);
    assert.equal(respuesta.cabeceras.get('accept-ranges'), 'bytes');
    assert.equal(respuesta.datos.length, 100);
  });

  test('entrega partes del archivo para adelantar audio y video', async () => {
    const original = randomBytes(5000);
    const video = await subirArchivo('clip.mp4', original, 'video/mp4');
    assert.equal(video.tipoVista, 'video');

    const medio = await vista(video.id, { Range: 'bytes=1000-2999' });
    assert.equal(medio.estado, 206);
    assert.equal(medio.cabeceras.get('content-range'), 'bytes 1000-2999/5000');
    assert.deepEqual(medio.datos, original.subarray(1000, 3000));

    const desde = await vista(video.id, { Range: 'bytes=4000-' });
    assert.deepEqual(desde.datos, original.subarray(4000));

    const final = await vista(video.id, { Range: 'bytes=-500' });
    assert.deepEqual(final.datos, original.subarray(4500));

    const fuera = await vista(video.id, { Range: 'bytes=6000-' });
    assert.equal(fuera.estado, 416);
    assert.equal(fuera.cabeceras.get('content-range'), 'bytes */5000');

    assert.equal((await vista(video.id, { Range: 'bytes=0-1,5-6' })).estado, 200);
    assert.equal((await vista(video.id, { Range: 'letras' })).estado, 200);
  });

  // fetch añade "Cache-Control: no-cache" a las peticiones condicionales, y con esa cabecera
  // nunca se responde 304; el navegador al revalidar su caché no la envía, así que se usa http.
  test('responde 304 si el navegador ya tiene esa versión', async () => {
    const imagen = await subirArchivo('foto.png', randomBytes(100), 'image/png');
    const etag = (await vista(imagen.id)).cabeceras.get('etag');
    assert.ok(etag);

    const estado = await new Promise((resolver, rechazar) => {
      http
        .get(`${entorno.servidor.url}/api/nodos/${imagen.id}/vista`, { headers: { Cookie: ana.cookie, 'If-None-Match': etag } }, (respuesta) => {
          respuesta.resume();
          resolver(respuesta.statusCode);
        })
        .on('error', rechazar);
    });
    assert.equal(estado, 304);
  });

  test('los textos se muestran como texto plano aunque sean HTML', async () => {
    const pagina = await subirArchivo('pagina.html', '<script>alert(1)</script>', 'text/html');
    assert.equal(pagina.tipoVista, 'texto');

    const respuesta = await vista(pagina.id);
    assert.equal(respuesta.cabeceras.get('content-type'), 'text/plain; charset=utf-8');
    assert.equal(respuesta.datos.toString(), '<script>alert(1)</script>');
  });

  test('los PDF se muestran sin sandbox para que funcione el visor del navegador', async () => {
    const pdf = await subirArchivo('doc.pdf', '%PDF-1.4', 'application/pdf');
    const respuesta = await vista(pdf.id);
    assert.equal(respuesta.cabeceras.get('content-type'), 'application/pdf');
    assert.equal(respuesta.cabeceras.get('content-security-policy'), null);
  });

  test('los formatos sin vista previa responden 415', async () => {
    const zip = await subirArchivo('datos.zip', 'PK', 'application/zip');
    assert.equal(zip.tipoVista, null);
    const respuesta = await vista(zip.id);
    assert.equal(respuesta.estado, 415);
    assert.equal(respuesta.cuerpo.codigo, 'VISTA_NO_DISPONIBLE');
  });

  test('la descarga también admite rangos', async () => {
    const original = randomBytes(3000);
    const archivo = await subirArchivo('datos.bin', original);
    const parcial = await ana.pedir('GET', `/api/nodos/${archivo.id}/descarga`, undefined, {
      cabeceras: { Range: 'bytes=2000-' },
    });
    assert.equal(parcial.estado, 206);
    assert.match(parcial.cabeceras.get('content-disposition'), /^attachment;/);
    assert.deepEqual(parcial.datos, original.subarray(2000));
  });

  test('no hay vista de carpetas ni de archivos ajenos', async () => {
    const imagen = await subirArchivo('foto.png', randomBytes(10), 'image/png');
    assert.equal((await vista(documentos)).estado, 400);

    const bea = crearCliente(entorno.servidor.url);
    await registrar(bea, 'bea@deskcloud.test');
    assert.equal((await bea.pedir('GET', `/api/nodos/${imagen.id}/vista`)).estado, 404);
  });

  test('interpreta las cabeceras Range', () => {
    assert.deepEqual(leerRango('bytes=0-99', 1000), { inicio: 0, fin: 99 });
    assert.deepEqual(leerRango('bytes=900-5000', 1000), { inicio: 900, fin: 999 });
    assert.deepEqual(leerRango('bytes=-100', 1000), { inicio: 900, fin: 999 });
    assert.deepEqual(leerRango('bytes=-5000', 1000), { inicio: 0, fin: 999 });
    assert.equal(leerRango(undefined, 1000), null);
    assert.equal(leerRango('bytes=-', 1000), null);
    assert.equal(typeof leerRango('bytes=1000-', 1000), 'symbol');
    assert.equal(typeof leerRango('bytes=0-0', 0), 'symbol');
  });
});
