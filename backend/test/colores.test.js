import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { avisos, crearCarpeta, elementoDe, prepararEquipo, prepararEspacio, subir } from './ayudantes.js';

const AZUL = '#4668a1';
const ROJO = '#e05757';
const VERDE = '#4caf7a';

function colorear(cliente, id, datos) {
  return cliente.pedir('PUT', `/api/nodos/${id}/color`, datos);
}

describe('colores en Mi espacio', () => {
  let espacio;

  beforeEach(async () => {
    espacio = await prepararEspacio();
  });

  afterEach(async () => {
    await espacio.servidor.cerrar();
  });

  test('cada elemento tiene un solo color, predeterminado o en hexadecimal', async () => {
    const { cliente, carpetas } = espacio;
    const asignado = await colorear(cliente, carpetas.Documentos, { color: '#ABCDEF' });
    assert.equal(asignado.estado, 200);
    assert.equal(asignado.cuerpo.elemento.color, '#abcdef');
    assert.equal(asignado.cuerpo.elemento.colorEsPersonal, false);

    await colorear(cliente, carpetas.Documentos, { color: ROJO });
    assert.equal((await elementoDe(cliente, espacio.raiz, 'Documentos')).color, ROJO);

    await colorear(cliente, carpetas.Documentos, { color: null });
    assert.equal((await elementoDe(cliente, espacio.raiz, 'Documentos')).color, null);
  });

  test('rechaza colores inválidos, "para todos" y la raíz', async () => {
    const { cliente, carpetas, raiz } = espacio;
    for (const color of ['rojo', '#fff', '#12345g', 123, undefined]) {
      assert.equal((await colorear(cliente, carpetas.Documentos, { color })).estado, 400);
    }
    assert.equal((await colorear(cliente, carpetas.Documentos, { color: ROJO, paraTodos: true, nota: 'x' })).estado, 400);
    assert.equal((await colorear(cliente, raiz, { color: ROJO })).estado, 400);
  });

  test('ofrece la lista de colores predeterminados', async () => {
    const { predeterminados } = (await espacio.cliente.pedir('GET', '/api/colores')).cuerpo;
    assert.equal(predeterminados.length, 8);
    assert.deepEqual(predeterminados[0], { nombre: 'Azul', valor: AZUL });
  });
});

describe('colores en un espacio compartido', () => {
  let equipo;
  let ana;
  let bea;
  let cata;
  let carpeta;

  beforeEach(async () => {
    equipo = await prepararEquipo();
    ({ ana, bea, cata } = equipo);
    carpeta = await crearCarpeta(ana, equipo.espacio.raizId, 'Informe');
  });

  afterEach(async () => {
    await equipo.servidor.cerrar();
  });

  const colorDe = async (cliente) => (await elementoDe(cliente, equipo.espacio.raizId, 'Informe')).color;

  test('el primer color es del grupo y los siguientes son personales', async () => {
    await colorear(ana, carpeta, { color: AZUL });
    assert.deepEqual([await colorDe(ana), await colorDe(bea), await colorDe(cata)], [AZUL, AZUL, AZUL]);

    const personal = await colorear(bea, carpeta, { color: ROJO });
    assert.equal(personal.cuerpo.elemento.colorEsPersonal, true);
    assert.deepEqual([await colorDe(ana), await colorDe(bea), await colorDe(cata)], [AZUL, ROJO, AZUL]);

    await colorear(ana, carpeta, { color: ROJO });
    assert.deepEqual([await colorDe(ana), await colorDe(bea), await colorDe(cata)], [ROJO, ROJO, AZUL]);

    await colorear(bea, carpeta, { color: null });
    assert.deepEqual([await colorDe(ana), await colorDe(bea), await colorDe(cata)], [ROJO, AZUL, AZUL]);
  });

  test('"para todos" exige nota, borra los colores personales, avisa y queda en el historial', async () => {
    await colorear(ana, carpeta, { color: AZUL });
    await colorear(bea, carpeta, { color: ROJO });

    assert.equal((await colorear(cata, carpeta, { color: VERDE, paraTodos: true })).estado, 400);
    assert.equal((await colorear(cata, carpeta, { color: VERDE, paraTodos: true, nota: '   ' })).estado, 400);

    const cambio = await colorear(cata, carpeta, { color: VERDE, paraTodos: true, nota: 'Se debe modificar esto' });
    assert.equal(cambio.estado, 200);
    assert.deepEqual([await colorDe(ana), await colorDe(bea), await colorDe(cata)], [VERDE, VERDE, VERDE]);

    const elemento = await elementoDe(bea, equipo.espacio.raizId, 'Informe');
    assert.equal(elemento.notaColor.texto, 'Se debe modificar esto');
    assert.equal(elemento.notaColor.autor.nombre, 'Cata');

    const aviso = (await avisos(ana)).find((a) => a.tipo === 'COLOR_PARA_TODOS');
    assert.equal(aviso.datos.nota, 'Se debe modificar esto');
    assert.equal(aviso.datos.color, VERDE);
    assert.equal((await avisos(cata)).some((a) => a.tipo === 'COLOR_PARA_TODOS'), false);

    const { actividad } = (await ana.pedir('GET', `/api/espacios/${equipo.espacio.id}/actividad`)).cuerpo;
    assert.deepEqual(actividad[0].detalles, { color: VERDE, nota: 'Se debe modificar esto' });

    await colorear(bea, carpeta, { color: ROJO });
    assert.equal((await elementoDe(bea, equipo.espacio.raizId, 'Informe')).notaColor.texto, 'Se debe modificar esto');
  });

  test('si se quita el color del grupo, el siguiente vuelve a ser del grupo', async () => {
    await colorear(ana, carpeta, { color: AZUL });
    await colorear(ana, carpeta, { color: null, paraTodos: true, nota: 'Sin color por ahora' });
    assert.equal(await colorDe(cata), null);
    await colorear(bea, carpeta, { color: ROJO });
    assert.deepEqual([await colorDe(ana), await colorDe(cata)], [ROJO, ROJO]);
  });

  test('una copia a otro espacio llega sin color; dentro del mismo espacio lo conserva', async () => {
    await colorear(ana, carpeta, { color: AZUL });
    const raizAna = equipo.usuarios.ana.usuario.raizId;
    const fuera = (await ana.pedir('POST', '/api/nodos/copiar', { ids: [carpeta], destinoId: raizAna })).cuerpo.elementos[0];
    assert.equal(fuera.color, null);

    const destino = await crearCarpeta(ana, equipo.espacio.raizId, 'Copias');
    const dentro = (await ana.pedir('POST', '/api/nodos/copiar', { ids: [carpeta], destinoId: destino })).cuerpo.elementos[0];
    assert.equal(dentro.color, AZUL);
  });

  test('quien sale del espacio pierde sus colores personales', async () => {
    await colorear(ana, carpeta, { color: AZUL });
    await colorear(bea, carpeta, { color: ROJO });
    await bea.pedir('POST', `/api/espacios/${equipo.espacio.id}/salir`);
    assert.equal(equipo.db.prepare('SELECT COUNT(*) AS total FROM colores_personales').get().total, 0);
  });

  test('los archivos también se colorean', async () => {
    const archivo = (await subir(bea, carpeta, 'a.txt', 'x')).cuerpo.elemento;
    const { elemento } = (await colorear(cata, archivo.id, { color: VERDE })).cuerpo;
    assert.equal(elemento.color, VERDE);
  });
});
