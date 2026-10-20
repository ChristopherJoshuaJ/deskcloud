import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { crearServicios } from '../src/servicios.js';
import {
  CONFIG_PRUEBAS,
  contenido,
  crearBaseDatosPrueba,
  crearCarpeta,
  crearCliente,
  descargar,
  idDe,
  iniciarServidorPrueba,
  nombres,
  registrar,
  subir,
} from './ayudantes.js';

describe('explorador', () => {
  let db;
  let servidor;
  let ana;
  let usuario;
  let raiz;
  let documentos;
  let imagenes;

  beforeEach(async () => {
    db = crearBaseDatosPrueba();
    servidor = await iniciarServidorPrueba(db);
    ana = crearCliente(servidor.url);
    usuario = await registrar(ana, 'ana@deskcloud.test');
    raiz = usuario.raizId;
    documentos = await idDe(ana, raiz, 'Documentos');
    imagenes = await idDe(ana, raiz, 'Imágenes');
  });

  afterEach(async () => {
    await servidor.cerrar();
  });

  test('muestra Mi espacio con las carpetas sugeridas', async () => {
    const { carpeta, ruta, elementos } = await contenido(ana, raiz);

    assert.equal(carpeta.nombre, 'Mi espacio');
    assert.equal(carpeta.esRaiz, true);
    assert.deepEqual(ruta, [{ id: raiz, nombre: 'Mi espacio', esRaiz: true }]);
    assert.deepEqual(elementos.map((e) => e.nombre), ['Audio', 'Documentos', 'Imágenes', 'Videos']);
    for (const e of elementos) {
      assert.equal(e.tipo, 'CARPETA');
      assert.equal(e.elementos, 0);
      assert.equal(e.esFavorito, true);
    }
  });

  test('crea carpetas, evita nombres repetidos y crea rutas completas', async () => {
    const creada = await ana.pedir('POST', `/api/nodos/${documentos}/carpetas`, { nombre: 'Universidad' });
    assert.equal(creada.estado, 201);
    const universidad = creada.cuerpo.elemento.id;

    const repetida = await ana.pedir('POST', `/api/nodos/${documentos}/carpetas`, { nombre: 'universidad' });
    assert.equal(repetida.estado, 409);
    assert.equal(repetida.cuerpo.codigo, 'NOMBRE_EN_USO');
    assert.equal(repetida.cuerpo.detalles.conflictos[0].existenteId, universidad);
    assert.equal(repetida.cuerpo.detalles.conflictos[0].nombreSugerido, 'universidad (2)');

    const invalida = await ana.pedir('POST', `/api/nodos/${documentos}/carpetas`, { nombre: 'a/b' });
    assert.equal(invalida.estado, 400);

    const anidada = await ana.pedir('POST', `/api/nodos/${universidad}/carpetas`, { ruta: 'Proyecto/Entregas/Final' });
    assert.equal(anidada.estado, 201);
    const otraVez = await ana.pedir('POST', `/api/nodos/${universidad}/carpetas`, { ruta: 'Proyecto/Entregas/Final' });
    assert.equal(otraVez.cuerpo.elemento.id, anidada.cuerpo.elemento.id);

    const { ruta } = await contenido(ana, anidada.cuerpo.elemento.id);
    assert.deepEqual(
      ruta.map((r) => r.nombre),
      ['Mi espacio', 'Documentos', 'Universidad', 'Proyecto', 'Entregas', 'Final'],
    );
  });

  test('el árbol solo muestra carpetas e indica cuáles tienen subcarpetas', async () => {
    await crearCarpeta(ana, documentos, 'Universidad');
    await subir(ana, raiz, 'suelto.txt', 'x');

    const { cuerpo } = await ana.pedir('GET', `/api/nodos/${raiz}/subcarpetas`);
    assert.deepEqual(cuerpo.subcarpetas.map((s) => [s.nombre, s.tieneSubcarpetas]), [
      ['Audio', false],
      ['Documentos', true],
      ['Imágenes', false],
      ['Videos', false],
    ]);
  });

  test('sube un archivo y lo descarga idéntico', async () => {
    const original = randomBytes(3000);
    const subida = await subir(ana, documentos, 'informe año.pdf', original, { tipo: 'application/pdf' });

    assert.equal(subida.estado, 201);
    assert.equal(subida.cuerpo.accion, 'creado');
    assert.equal(subida.cuerpo.elemento.tamano, 3000);
    assert.equal(subida.cuerpo.elemento.mime, 'application/pdf');
    assert.equal(subida.cuerpo.elemento.version, 1);

    const descarga = await ana.pedir('GET', `/api/nodos/${subida.cuerpo.elemento.id}/descarga`);
    assert.equal(descarga.estado, 200);
    assert.deepEqual(descarga.datos, original);
    assert.equal(descarga.cabeceras.get('content-type'), 'application/pdf');
    assert.match(descarga.cabeceras.get('content-disposition'), /filename\*=UTF-8''informe%20a%C3%B1o\.pdf/);
    assert.equal(descarga.cabeceras.get('x-content-type-options'), 'nosniff');

    const { elementos } = await contenido(ana, raiz);
    assert.equal(elementos.find((e) => e.id === documentos).elementos, 1);
  });

  test('deduce el tipo por la extensión cuando no se indica', async () => {
    const { cuerpo } = await subir(ana, documentos, 'cancion.mp3', 'audio', { tipo: 'application/octet-stream' });
    assert.equal(cuerpo.elemento.mime, 'audio/mpeg');
  });

  test('si el nombre ya existe pregunta, reemplaza, conserva ambos u omite', async () => {
    const original = (await subir(ana, documentos, 'foto.jpg', 'v1')).cuerpo.elemento;

    const pregunta = await subir(ana, documentos, 'foto.jpg', 'v2');
    assert.equal(pregunta.estado, 409);
    assert.deepEqual(pregunta.cuerpo.detalles.conflictos[0], {
      nombre: 'foto.jpg',
      existenteId: original.id,
      tipoExistente: 'ARCHIVO',
      nombreSugerido: 'foto (2).jpg',
    });
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM versiones').get().total, 1);

    const reemplazo = await subir(ana, documentos, 'foto.jpg', 'v3', { conflicto: 'reemplazar' });
    assert.equal(reemplazo.estado, 201);
    assert.equal(reemplazo.cuerpo.accion, 'reemplazado');
    assert.equal(reemplazo.cuerpo.elemento.id, original.id);
    assert.equal(reemplazo.cuerpo.elemento.version, 2);
    assert.equal(await descargar(ana, original.id), 'v3');

    const ambos = await subir(ana, documentos, 'foto.jpg', 'v4', { conflicto: 'conservar' });
    assert.equal(ambos.cuerpo.elemento.nombre, 'foto (2).jpg');

    const omitido = await subir(ana, documentos, 'foto.jpg', 'v5', { conflicto: 'omitir' });
    assert.equal(omitido.estado, 200);
    assert.equal(omitido.cuerpo.accion, 'omitido');
    assert.equal(await descargar(ana, original.id), 'v3');

    assert.deepEqual(await nombres(ana, documentos), ['foto (2).jpg', 'foto.jpg']);
  });

  test('sube carpetas completas creando y reutilizando la estructura', async () => {
    await subir(ana, raiz, 'Viaje/Día 1/playa.jpg', 'p');
    await subir(ana, raiz, 'Viaje/notas.txt', 'n');
    await subir(ana, raiz, 'Viaje/Día 1/cena.jpg', 'c');

    const viaje = await idDe(ana, raiz, 'Viaje');
    const { elementos } = await contenido(ana, viaje);
    assert.deepEqual(elementos.map((e) => [e.nombre, e.tipo, e.elementos]), [
      ['Día 1', 'CARPETA', 2],
      ['notas.txt', 'ARCHIVO', null],
    ]);

    const invalida = await subir(ana, raiz, 'Viaje/../fuera.txt', 'x');
    assert.equal(invalida.estado, 400);
  });

  test('verifica qué nombres chocan antes de subir', async () => {
    await subir(ana, documentos, 'a.txt', 'a');
    const { cuerpo } = await ana.pedir('POST', `/api/nodos/${documentos}/verificar-nombres`, {
      rutas: ['a.txt', 'b.txt', 'Nueva/a.txt'],
    });
    assert.equal(cuerpo.conflictos.length, 1);
    assert.equal(cuerpo.conflictos[0].ruta, 'a.txt');
    assert.equal(cuerpo.conflictos[0].nombreSugerido, 'a (2).txt');
  });

  test('renombra elementos', async () => {
    const borrador = (await subir(ana, documentos, 'borrador.txt', 'b')).cuerpo.elemento.id;
    await subir(ana, documentos, 'final.txt', 'f');

    const renombrado = await ana.pedir('PATCH', `/api/nodos/${borrador}`, { nombre: 'Entrega.txt' });
    assert.equal(renombrado.estado, 200);
    assert.equal(renombrado.cuerpo.elemento.nombre, 'Entrega.txt');

    assert.equal((await ana.pedir('PATCH', `/api/nodos/${borrador}`, { nombre: 'FINAL.txt' })).estado, 409);
    assert.equal((await ana.pedir('PATCH', `/api/nodos/${borrador}`, { nombre: 'ENTREGA.txt' })).estado, 200);
    assert.equal((await ana.pedir('PATCH', `/api/nodos/${borrador}`, { nombre: 'a:b' })).estado, 400);
    assert.equal((await ana.pedir('PATCH', `/api/nodos/${raiz}`, { nombre: 'Otro' })).estado, 400);
  });

  test('mueve elementos y no permite meter una carpeta dentro de sí misma', async () => {
    const carpetaA = await crearCarpeta(ana, raiz, 'A');
    const carpetaB = await crearCarpeta(ana, carpetaA, 'B');
    const archivo = (await subir(ana, documentos, 'x.txt', 'x')).cuerpo.elemento.id;

    const movido = await ana.pedir('POST', '/api/nodos/mover', { ids: [archivo], destinoId: carpetaA });
    assert.equal(movido.estado, 200);
    assert.deepEqual(await nombres(ana, documentos), []);
    assert.deepEqual(await nombres(ana, carpetaA), ['B', 'x.txt']);

    const ciclo = await ana.pedir('POST', '/api/nodos/mover', { ids: [carpetaA], destinoId: carpetaB });
    assert.equal(ciclo.estado, 400);
    assert.equal(ciclo.cuerpo.codigo, 'REGLA_NEGOCIO');

    const moverRaiz = await ana.pedir('POST', '/api/nodos/mover', { ids: [raiz], destinoId: carpetaA });
    assert.equal(moverRaiz.estado, 400);
  });

  test('al mover con nombres repetidos no cambia nada hasta que se decide', async () => {
    const aNuevo = (await subir(ana, documentos, 'a.txt', 'nuevo')).cuerpo.elemento.id;
    const b = (await subir(ana, documentos, 'b.txt', 'b')).cuerpo.elemento.id;
    await subir(ana, imagenes, 'a.txt', 'viejo');

    const pregunta = await ana.pedir('POST', '/api/nodos/mover', { ids: [aNuevo, b], destinoId: imagenes });
    assert.equal(pregunta.estado, 409);
    assert.equal(pregunta.cuerpo.detalles.conflictos.length, 1);
    assert.deepEqual(await nombres(ana, documentos), ['a.txt', 'b.txt']);

    await ana.pedir('POST', '/api/nodos/mover', { ids: [aNuevo, b], destinoId: imagenes, conflicto: 'conservar' });
    assert.deepEqual(await nombres(ana, imagenes), ['a (2).txt', 'a.txt', 'b.txt']);
    assert.equal(await descargar(ana, aNuevo), 'nuevo');
  });

  test('reemplazar al mover envía el archivo anterior a la papelera', async () => {
    const nuevo = (await subir(ana, documentos, 'c.txt', 'nuevo')).cuerpo.elemento.id;
    const viejo = (await subir(ana, imagenes, 'c.txt', 'viejo')).cuerpo.elemento.id;

    const { estado } = await ana.pedir('POST', '/api/nodos/mover', { ids: [nuevo], destinoId: imagenes, conflicto: 'reemplazar' });
    assert.equal(estado, 200);
    assert.equal(await idDe(ana, imagenes, 'c.txt'), nuevo);
    assert.equal(db.prepare('SELECT en_papelera AS p FROM nodos WHERE id = ?').get(viejo).p, 1);
  });

  test('copia carpetas completas con contenido independiente y solo la versión actual', async () => {
    const proyecto = await crearCarpeta(ana, documentos, 'Proyecto');
    const plano = (await subir(ana, proyecto, 'plano.txt', 'versión 1')).cuerpo.elemento.id;
    await subir(ana, proyecto, 'plano.txt', 'versión 2', { conflicto: 'reemplazar' });
    await subir(ana, proyecto, 'Fotos/foto.jpg', 'foto');

    const copia = await ana.pedir('POST', '/api/nodos/copiar', { ids: [proyecto], destinoId: raiz });
    assert.equal(copia.estado, 201);
    const proyectoCopia = copia.cuerpo.elementos[0];
    assert.equal(proyectoCopia.nombre, 'Proyecto');
    assert.notEqual(proyectoCopia.id, proyecto);

    const planoCopia = await idDe(ana, proyectoCopia.id, 'plano.txt');
    assert.equal(await descargar(ana, planoCopia), 'versión 2');
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM versiones WHERE nodo_id = ?').get(planoCopia).total, 1);
    assert.deepEqual(await nombres(ana, await idDe(ana, proyectoCopia.id, 'Fotos')), ['foto.jpg']);

    await subir(ana, proyecto, 'plano.txt', 'versión 3', { conflicto: 'reemplazar' });
    assert.equal(await descargar(ana, planoCopia), 'versión 2');
    assert.equal(await descargar(ana, plano), 'versión 3');

    const mismaCarpeta = await ana.pedir('POST', '/api/nodos/copiar', { ids: [proyecto], destinoId: documentos });
    assert.equal(mismaCarpeta.estado, 409);
    const conservada = await ana.pedir('POST', '/api/nodos/copiar', { ids: [proyecto], destinoId: documentos, conflicto: 'conservar' });
    assert.equal(conservada.cuerpo.elementos[0].nombre, 'Proyecto (2)');

    const fotos = await idDe(ana, proyecto, 'Fotos');
    assert.equal((await ana.pedir('POST', '/api/nodos/copiar', { ids: [proyecto], destinoId: fotos })).estado, 400);
  });

  test('enviar a la papelera oculta el elemento, su contenido y su acceso rápido', async () => {
    const archivo = (await subir(ana, documentos, 'secreto.txt', 's')).cuerpo.elemento.id;

    const { estado, cuerpo } = await ana.pedir('POST', '/api/nodos/papelera', { ids: [documentos, archivo] });
    assert.equal(estado, 200);
    assert.equal(cuerpo.eliminados, 1);

    assert.ok(!(await nombres(ana, raiz)).includes('Documentos'));
    assert.equal((await ana.pedir('GET', `/api/nodos/${documentos}/contenido`)).estado, 404);
    assert.equal((await ana.pedir('GET', `/api/nodos/${archivo}/descarga`)).estado, 404);
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM favoritos WHERE nodo_id = ?').get(documentos).total, 0);
    assert.deepEqual(
      { ...db.prepare('SELECT en_papelera AS p, padre_id AS padre, padre_original_id AS original FROM nodos WHERE id = ?').get(documentos) },
      { p: 1, padre: null, original: raiz },
    );

    assert.equal((await ana.pedir('POST', `/api/nodos/${raiz}/carpetas`, { nombre: 'Documentos' })).estado, 201);
    assert.equal((await ana.pedir('POST', '/api/nodos/papelera', { ids: [raiz] })).estado, 400);
  });

  test('busca por nombre dentro de la carpeta y sus subcarpetas', async () => {
    const universidad = await crearCarpeta(ana, documentos, 'Universidad');
    await subir(ana, universidad, 'Informe Final.pdf', 'f');
    await subir(ana, documentos, 'informe-borrador.txt', 'b');
    await subir(ana, imagenes, 'informe.png', 'fuera');

    const { cuerpo } = await ana.pedir('GET', `/api/nodos/${documentos}/buscar?q=INFORME`);
    assert.deepEqual(cuerpo.resultados.map((r) => [r.nombre, r.ubicacion]), [
      ['Informe Final.pdf', 'Universidad'],
      ['informe-borrador.txt', ''],
    ]);

    assert.equal((await ana.pedir('GET', `/api/nodos/${documentos}/buscar?q=`)).estado, 400);
    assert.deepEqual((await ana.pedir('GET', `/api/nodos/${documentos}/buscar?q=%25`)).cuerpo.resultados, []);
  });

  test('muestra los detalles y el resumen de una carpeta', async () => {
    const a = (await subir(ana, documentos, 'a.txt', '0123456789')).cuerpo.elemento.id;
    await subir(ana, documentos, 'Sub/b.txt', '01234567890123456789');

    const carpeta = (await ana.pedir('GET', `/api/nodos/${documentos}`)).cuerpo;
    assert.deepEqual(carpeta.resumen, { carpetas: 1, archivos: 2, tamanoTotal: 30 });
    assert.deepEqual(carpeta.ruta.map((r) => r.nombre), ['Mi espacio', 'Documentos']);

    const archivo = (await ana.pedir('GET', `/api/nodos/${a}`)).cuerpo;
    assert.equal(archivo.resumen, null);
    assert.equal(archivo.elemento.tamano, 10);
  });

  test('no se puede ver ni modificar el espacio de otra persona', async () => {
    const archivo = (await subir(ana, documentos, 'privado.txt', 'p')).cuerpo.elemento.id;
    const bea = crearCliente(servidor.url);
    const raizBea = (await registrar(bea, 'bea@deskcloud.test')).raizId;

    assert.equal((await bea.pedir('GET', `/api/nodos/${raiz}/contenido`)).estado, 404);
    assert.equal((await bea.pedir('GET', `/api/nodos/${archivo}`)).estado, 404);
    assert.equal((await bea.pedir('GET', `/api/nodos/${archivo}/descarga`)).estado, 404);
    assert.equal((await bea.pedir('PATCH', `/api/nodos/${archivo}`, { nombre: 'mio.txt' })).estado, 404);
    assert.equal((await subir(bea, documentos, 'intruso.txt', 'x')).estado, 404);
    assert.equal((await bea.pedir('POST', '/api/nodos/mover', { ids: [archivo], destinoId: raizBea })).estado, 404);
    assert.equal((await bea.pedir('POST', '/api/nodos/copiar', { ids: [archivo], destinoId: raizBea })).estado, 404);
    assert.equal((await bea.pedir('POST', '/api/nodos/papelera', { ids: [archivo] })).estado, 404);
    assert.equal(await descargar(ana, archivo), 'p');
  });

  test('las rutas del explorador requieren sesión', async () => {
    const anonimo = crearCliente(servidor.url);
    assert.equal((await anonimo.pedir('GET', `/api/nodos/${raiz}/contenido`)).estado, 401);
    assert.equal((await subir(anonimo, raiz, 'x.txt', 'x')).estado, 401);
  });

  test('una subida interrumpida no deja el archivo a medias', async () => {
    const servicios = crearServicios(db, CONFIG_PRUEBAS);
    async function* subidaQueFalla() {
      yield randomBytes(2048);
      throw new Error('conexión perdida');
    }

    await assert.rejects(
      servicios.subidas.subirArchivo(usuario, raiz, { ruta: 'roto.bin', contenido: subidaQueFalla() }),
      /conexión perdida/,
    );
    assert.equal(db.prepare(`SELECT COUNT(*) AS total FROM nodos WHERE nombre = 'roto.bin'`).get().total, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM fragmentos').get().total, 0);
  });
});
