import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import { avisos, contar, contenido, crearCarpeta, crearCliente, descargar, elementoDe, nombres, prepararEquipo, registrar, subir } from './ayudantes.js';

describe('espacios compartidos', () => {
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

  test('aparece en la barra lateral de cada miembro junto a Mi espacio', async () => {
    const { cuerpo } = await bea.pedir('GET', '/api/espacios');
    assert.equal(cuerpo.personal.nombre, 'Mi espacio');
    assert.equal(cuerpo.personal.raizId, equipo.usuarios.bea.usuario.raizId);
    assert.equal(cuerpo.compartidos.length, 1);
    assert.equal(cuerpo.compartidos[0].nombre, 'Proyecto');
    assert.equal(cuerpo.compartidos[0].totalMiembros, 3);
    assert.equal(cuerpo.compartidos[0].esAdministrador, false);
    assert.equal(cuerpo.compartidos[0].administrador.nombre, 'Ana');

    const vista = await contenido(bea, raiz);
    assert.equal(vista.carpeta.nombre, 'Proyecto');
    assert.deepEqual(vista.ruta.map((parte) => parte.nombre), ['Proyecto']);
  });

  test('solo el administrador invita y la persona debe aceptar', async () => {
    const dani = crearCliente(equipo.servidor.url);
    await registrar(dani, 'dani@deskcloud.test');

    assert.equal((await bea.pedir('POST', `/api/espacios/${espacio.id}/invitaciones`, { correo: 'dani@deskcloud.test' })).estado, 403);
    assert.equal((await ana.pedir('POST', `/api/espacios/${espacio.id}/invitaciones`, { correo: 'nadie@deskcloud.test' })).estado, 404);
    assert.equal((await ana.pedir('POST', `/api/espacios/${espacio.id}/invitaciones`, { correo: 'bea@deskcloud.test' })).estado, 409);

    const invitar = await ana.pedir('POST', `/api/espacios/${espacio.id}/invitaciones`, { correo: 'DANI@deskcloud.test' });
    assert.equal(invitar.estado, 201);
    assert.equal(invitar.cuerpo.invitaciones[0].invitado.correo, 'dani@deskcloud.test');
    assert.equal((await ana.pedir('POST', `/api/espacios/${espacio.id}/invitaciones`, { correo: 'dani@deskcloud.test' })).estado, 409);

    assert.equal((await dani.pedir('GET', `/api/nodos/${raiz}/contenido`)).estado, 404);
    const [aviso] = await avisos(dani);
    assert.equal(aviso.tipo, 'INVITACION');
    assert.equal(aviso.datos.espacioNombre, 'Proyecto');

    const { invitaciones } = (await dani.pedir('GET', '/api/invitaciones')).cuerpo;
    assert.equal(invitaciones[0].espacio.nombre, 'Proyecto');
    assert.equal((await bea.pedir('POST', `/api/invitaciones/${invitaciones[0].id}/aceptar`)).estado, 404);

    const aceptada = await dani.pedir('POST', `/api/invitaciones/${invitaciones[0].id}/aceptar`);
    assert.equal(aceptada.cuerpo.miembros.length, 4);
    assert.equal((await dani.pedir('GET', `/api/nodos/${raiz}/contenido`)).estado, 200);
  });

  test('una invitación se puede rechazar o cancelar', async () => {
    const dani = crearCliente(equipo.servidor.url);
    await registrar(dani, 'dani@deskcloud.test');
    await ana.pedir('POST', `/api/espacios/${espacio.id}/invitaciones`, { correo: 'dani@deskcloud.test' });
    const [invitacion] = (await dani.pedir('GET', '/api/invitaciones')).cuerpo.invitaciones;
    const rechazada = await dani.pedir('POST', `/api/invitaciones/${invitacion.id}/rechazar`);
    assert.deepEqual(rechazada.cuerpo.invitaciones, []);

    const nueva = await ana.pedir('POST', `/api/espacios/${espacio.id}/invitaciones`, { correo: 'dani@deskcloud.test' });
    const cancelada = await ana.pedir('DELETE', `/api/espacios/${espacio.id}/invitaciones/${nueva.cuerpo.invitaciones[0].id}`);
    assert.deepEqual(cancelada.cuerpo.invitaciones, []);
    assert.deepEqual((await dani.pedir('GET', '/api/invitaciones')).cuerpo.invitaciones, []);
  });

  test('todos los miembros crean, suben, renombran, mueven y editan', async () => {
    const docs = await crearCarpeta(bea, raiz, 'Docs');
    const archivo = (await subir(cata, docs, 'plan.txt', 'v1', { tipo: 'text/plain' })).cuerpo.elemento;
    await bea.pedir('PATCH', `/api/nodos/${archivo.id}`, { nombre: 'plan final.txt' });
    const otra = await crearCarpeta(ana, raiz, 'Entregas');
    assert.equal((await cata.pedir('POST', '/api/nodos/mover', { ids: [archivo.id], destinoId: otra })).estado, 200);

    const { version } = (await ana.pedir('GET', `/api/nodos/${archivo.id}/texto`)).cuerpo;
    await ana.pedir('PUT', `/api/nodos/${archivo.id}/texto`, Buffer.from('v2'), {
      tipo: 'text/plain',
      cabeceras: { 'If-Match': `"${version.sha256}"` },
    });
    assert.equal(await descargar(bea, archivo.id), 'v2');
    assert.deepEqual(await nombres(cata, otra), ['plan final.txt']);

    const { versiones } = (await bea.pedir('GET', `/api/nodos/${archivo.id}/versiones`)).cuerpo;
    assert.deepEqual(versiones.map((v) => v.autor.nombre), ['Ana', 'Cata']);
  });

  test('eliminar requiere votación, también al reemplazar o borrar versiones', async () => {
    const archivo = (await subir(bea, raiz, 'a.txt', '1')).cuerpo.elemento;
    await subir(bea, raiz, 'a.txt', '2', { conflicto: 'reemplazar' });
    const carpeta = await crearCarpeta(bea, raiz, 'Otra');
    await subir(bea, carpeta, 'a.txt', 'otro');

    const directo = await bea.pedir('POST', '/api/nodos/papelera', { ids: [archivo.id] });
    assert.equal(directo.estado, 409);
    assert.equal(directo.cuerpo.codigo, 'VOTACION_REQUERIDA');

    const reemplazo = await bea.pedir('POST', '/api/nodos/mover', { ids: [archivo.id], destinoId: carpeta, conflicto: 'reemplazar' });
    assert.equal(reemplazo.cuerpo.codigo, 'VOTACION_REQUERIDA');

    const [, anterior] = (await bea.pedir('GET', `/api/nodos/${archivo.id}/versiones`)).cuerpo.versiones;
    const version = await bea.pedir('DELETE', `/api/nodos/${archivo.id}/versiones/${anterior.id}`);
    assert.equal(version.cuerpo.codigo, 'VOTACION_REQUERIDA');

    assert.ok(await elementoDe(ana, raiz, 'a.txt'));
  });

  test('entre espacios solo se copia', async () => {
    const compartido = (await subir(bea, raiz, 'informe.txt', 'equipo')).cuerpo.elemento;
    const miEspacio = equipo.usuarios.bea.usuario.raizId;

    const mover = await bea.pedir('POST', '/api/nodos/mover', { ids: [compartido.id], destinoId: miEspacio });
    assert.equal(mover.estado, 400);

    const haciaMi = await bea.pedir('POST', '/api/nodos/copiar', { ids: [compartido.id], destinoId: miEspacio });
    assert.equal(haciaMi.estado, 201);
    assert.equal(await descargar(bea, haciaMi.cuerpo.elementos[0].id), 'equipo');

    const propio = (await subir(bea, miEspacio, 'mio.txt', 'personal')).cuerpo.elemento;
    const haciaEquipo = await bea.pedir('POST', '/api/nodos/copiar', { ids: [propio.id], destinoId: raiz });
    assert.equal(haciaEquipo.estado, 201);
    assert.equal(await descargar(cata, haciaEquipo.cuerpo.elementos[0].id), 'personal');
    assert.equal((await cata.pedir('GET', `/api/nodos/${propio.id}`)).estado, 404);
  });

  test('solo el administrador saca miembros, y quien sale pierde el acceso', async () => {
    assert.equal((await bea.pedir('DELETE', `/api/espacios/${espacio.id}/miembros/${equipo.usuarios.cata.usuario.id}`)).estado, 403);

    const sacada = await ana.pedir('DELETE', `/api/espacios/${espacio.id}/miembros/${equipo.usuarios.cata.usuario.id}`);
    assert.deepEqual(sacada.cuerpo.miembros.map((m) => m.nombre), ['Ana', 'Bea']);
    assert.equal((await cata.pedir('GET', `/api/nodos/${raiz}/contenido`)).estado, 404);
    assert.equal((await avisos(cata))[0].tipo, 'EXPULSADO');

    const salida = await bea.pedir('POST', `/api/espacios/${espacio.id}/salir`);
    assert.deepEqual(salida.cuerpo, { eliminado: false });
    assert.equal((await bea.pedir('GET', `/api/espacios/${espacio.id}`)).estado, 404);
    assert.deepEqual((await bea.pedir('GET', '/api/espacios')).cuerpo.compartidos, []);
  });

  test('si el administrador sale, el rol pasa al miembro más antiguo', async () => {
    await ana.pedir('POST', `/api/espacios/${espacio.id}/salir`);
    const { espacio: datos, miembros } = (await bea.pedir('GET', `/api/espacios/${espacio.id}`)).cuerpo;
    assert.equal(datos.esAdministrador, true);
    assert.deepEqual(miembros.map((m) => [m.nombre, m.esAdministrador]), [
      ['Bea', true],
      ['Cata', false],
    ]);
    assert.ok((await avisos(bea)).some((aviso) => aviso.tipo === 'ADMINISTRADOR'));
  });

  test('el último miembro debe confirmar y al salir se elimina todo el espacio', async () => {
    await subir(ana, raiz, 'datos.bin', Buffer.alloc(3000, 1));
    await bea.pedir('POST', `/api/espacios/${espacio.id}/salir`);
    await cata.pedir('POST', `/api/espacios/${espacio.id}/salir`);

    const sinConfirmar = await ana.pedir('POST', `/api/espacios/${espacio.id}/salir`);
    assert.equal(sinConfirmar.estado, 409);
    assert.equal(sinConfirmar.cuerpo.codigo, 'CONFIRMACION_REQUERIDA');

    const confirmado = await ana.pedir('POST', `/api/espacios/${espacio.id}/salir`, { confirmar: true });
    assert.deepEqual(confirmado.cuerpo, { eliminado: true });
    assert.equal(equipo.db.prepare('SELECT COUNT(*) AS total FROM espacios WHERE id = ?').get(espacio.id).total, 0);
    assert.equal(equipo.db.prepare('SELECT COUNT(*) AS total FROM nodos WHERE espacio_id = ?').get(espacio.id).total, 0);
    assert.equal(contar(equipo.db, 'fragmentos'), 0);
  });

  test('cualquier miembro renombra el espacio y todo queda en el historial', async () => {
    const docs = await crearCarpeta(bea, raiz, 'Docs');
    await subir(cata, docs, 'nota.txt', 'x');
    await bea.pedir('PATCH', `/api/espacios/${espacio.id}`, { nombre: 'Proyecto final' });

    const { actividad } = (await ana.pedir('GET', `/api/espacios/${espacio.id}/actividad`)).cuerpo;
    assert.deepEqual(
      actividad.map((a) => [a.accion, a.usuario?.nombre, a.nombre]),
      [
        ['RENOMBRAR_ESPACIO', 'Bea', 'Proyecto final'],
        ['SUBIR', 'Cata', 'nota.txt'],
        ['CREAR_CARPETA', 'Bea', 'Docs'],
        ['UNIRSE', 'Cata', 'Cata'],
        ['INVITAR', 'Ana', 'Cata'],
        ['UNIRSE', 'Bea', 'Bea'],
        ['INVITAR', 'Ana', 'Bea'],
        ['CREAR_ESPACIO', 'Ana', 'Proyecto'],
      ],
    );
    assert.equal(actividad[0].detalles.nombreAnterior, 'Proyecto');

    const pagina = (await ana.pedir('GET', `/api/espacios/${espacio.id}/actividad?limite=2&antesDe=${actividad[1].id}`)).cuerpo;
    assert.deepEqual(pagina.actividad.map((a) => a.accion), ['CREAR_CARPETA', 'UNIRSE']);
  });

  test('alguien ajeno no ve nada del espacio', async () => {
    const dani = crearCliente(equipo.servidor.url);
    await registrar(dani, 'dani@deskcloud.test');
    const archivo = (await subir(bea, raiz, 'secreto.txt', 's')).cuerpo.elemento;
    assert.equal((await dani.pedir('GET', `/api/espacios/${espacio.id}`)).estado, 404);
    assert.equal((await dani.pedir('GET', `/api/nodos/${archivo.id}/descarga`)).estado, 404);
    assert.equal((await dani.pedir('GET', `/api/espacios/${espacio.id}/actividad`)).estado, 404);
    assert.equal((await dani.pedir('POST', `/api/espacios/${espacio.id}/propuestas`, { tipo: 'eliminar', ids: [archivo.id] })).estado, 404);
  });
});
