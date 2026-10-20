import assert from 'node:assert/strict';
import { crc32 } from 'node:zlib';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { crearCarpeta, crearCliente, prepararEquipo, prepararEspacio, registrar, subir } from './ayudantes.js';

// Lector mínimo de ZIP sin compresión: recorre el directorio central y comprueba cada CRC.
function leerZip(datos) {
  const fin = datos.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  assert.ok(fin >= 0, 'falta el fin del directorio central');
  const total = datos.readUInt16LE(fin + 10);
  let posicion = datos.readUInt32LE(fin + 16);
  const entradas = new Map();
  for (let i = 0; i < total; i++) {
    assert.equal(datos.readUInt32LE(posicion), 0x02014b50);
    const banderas = datos.readUInt16LE(posicion + 8);
    const metodo = datos.readUInt16LE(posicion + 10);
    const crc = datos.readUInt32LE(posicion + 16);
    const tamano = datos.readUInt32LE(posicion + 24);
    const largoNombre = datos.readUInt16LE(posicion + 28);
    const local = datos.readUInt32LE(posicion + 42);
    const nombre = datos.subarray(posicion + 46, posicion + 46 + largoNombre).toString('utf8');
    assert.equal(banderas & 0x0800, 0x0800, 'el nombre debe ir en UTF-8');
    assert.equal(metodo, 0);

    assert.equal(datos.readUInt32LE(local), 0x04034b50);
    const inicio = local + 30 + datos.readUInt16LE(local + 26) + datos.readUInt16LE(local + 28);
    const contenido = datos.subarray(inicio, inicio + tamano);
    assert.equal(crc32(contenido), crc, `CRC incorrecto en ${nombre}`);
    entradas.set(nombre, contenido.toString('utf8'));
    posicion += 46 + largoNombre;
  }
  return entradas;
}

describe('descargar carpeta como ZIP', () => {
  let entorno;
  let ana;

  beforeEach(async () => {
    entorno = await prepararEspacio();
    ana = entorno.cliente;
  });

  afterEach(async () => {
    await entorno.servidor.cerrar();
  });

  test('incluye subcarpetas, carpetas vacías y archivos de varios fragmentos', async () => {
    const proyecto = await crearCarpeta(ana, entorno.carpetas.Documentos, 'Proyecto ñandú');
    const grande = Buffer.alloc(3500, 'a');
    await subir(ana, proyecto, 'grande.txt', grande);
    await subir(ana, proyecto, 'Notas/día 1.txt', 'hola');
    await subir(ana, proyecto, 'vacío.txt', '');
    await crearCarpeta(ana, proyecto, 'Vacía');
    await subir(ana, proyecto, 'grande.txt', 'versión nueva', { conflicto: 'reemplazar' });
    const eliminado = (await subir(ana, proyecto, 'borrado.txt', 'x')).cuerpo.elemento.id;
    await ana.pedir('POST', '/api/nodos/papelera', { ids: [eliminado] });

    const respuesta = await ana.pedir('GET', `/api/nodos/${proyecto}/zip`);
    assert.equal(respuesta.estado, 200);
    assert.equal(respuesta.cabeceras.get('content-type'), 'application/zip');
    assert.match(respuesta.cabeceras.get('content-disposition'), /filename\*=UTF-8''Proyecto%20%C3%B1and%C3%BA\.zip/);
    assert.equal(Number(respuesta.cabeceras.get('content-length')), respuesta.datos.length);

    const entradas = leerZip(respuesta.datos);
    assert.deepEqual([...entradas.keys()], [
      'Proyecto ñandú/',
      'Proyecto ñandú/Notas/',
      'Proyecto ñandú/Notas/día 1.txt',
      'Proyecto ñandú/Vacía/',
      'Proyecto ñandú/grande.txt',
      'Proyecto ñandú/vacío.txt',
    ]);
    assert.equal(entradas.get('Proyecto ñandú/grande.txt'), 'versión nueva');
    assert.equal(entradas.get('Proyecto ñandú/Notas/día 1.txt'), 'hola');
    assert.equal(entradas.get('Proyecto ñandú/vacío.txt'), '');
  });

  test('archivos grandes de varios fragmentos llegan completos', async () => {
    const datos = Buffer.alloc(5000);
    for (let i = 0; i < datos.length; i++) datos[i] = i % 251;
    await subir(ana, entorno.carpetas.Documentos, 'binario.bin', datos);
    const respuesta = await ana.pedir('GET', `/api/nodos/${entorno.carpetas.Documentos}/zip`);
    const inicio = respuesta.datos.indexOf(Buffer.from('Documentos/binario.bin')) + 'Documentos/binario.bin'.length;
    assert.ok(respuesta.datos.subarray(inicio, inicio + datos.length).equals(datos));
    leerZip(respuesta.datos);
  });

  test('la raíz se descarga como "Mi espacio" y no se puede pedir un archivo ni algo ajeno', async () => {
    const respuesta = await ana.pedir('GET', `/api/nodos/${entorno.raiz}/zip`);
    assert.ok(leerZip(respuesta.datos).has('Mi espacio/Documentos/'));

    const archivo = (await subir(ana, entorno.raiz, 'a.txt', 'x')).cuerpo.elemento.id;
    assert.equal((await ana.pedir('GET', `/api/nodos/${archivo}/zip`)).estado, 400);

    const bea = crearCliente(entorno.servidor.url);
    await registrar(bea, 'bea@deskcloud.test');
    assert.equal((await bea.pedir('GET', `/api/nodos/${entorno.raiz}/zip`)).estado, 404);
  });
});

describe('espacio usado', () => {
  test('separa Mi espacio de cada espacio compartido', async () => {
    const equipo = await prepararEquipo();
    try {
      const { ana, bea } = equipo;
      const raizAna = equipo.usuarios.ana.usuario.raizId;
      await subir(ana, raizAna, 'a.txt', '12345');
      await subir(ana, raizAna, 'a.txt', '1234567', { conflicto: 'reemplazar' });
      const carpeta = await crearCarpeta(ana, raizAna, 'Vieja');
      await subir(ana, carpeta, 'b.txt', '123');
      await ana.pedir('POST', '/api/nodos/papelera', { ids: [carpeta] });
      await subir(bea, equipo.espacio.raizId, 'equipo.txt', '1234567890');

      const { personal, compartidos } = (await ana.pedir('GET', '/api/cuenta/espacio-usado')).cuerpo;
      assert.deepEqual(personal, {
        id: equipo.usuarios.ana.usuario.espacioId,
        nombre: 'Mi espacio',
        total: 15,
        archivos: 7,
        versionesAnteriores: 5,
        papelera: 3,
        cantidadArchivos: 1,
      });
      assert.deepEqual(compartidos, [
        {
          id: equipo.espacio.id,
          nombre: 'Proyecto',
          total: 10,
          archivos: 10,
          versionesAnteriores: 0,
          papelera: 0,
          cantidadArchivos: 1,
        },
      ]);
      const deBea = (await bea.pedir('GET', '/api/cuenta/espacio-usado')).cuerpo;
      assert.equal(deBea.personal.total, 0);
    } finally {
      await equipo.servidor.cerrar();
    }
  });
});
