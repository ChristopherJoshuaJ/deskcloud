import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import {
  avisos,
  contenido,
  crearBaseDatosPrueba,
  crearCarpeta,
  crearCliente,
  descargar,
  elementoDe,
  iniciarServidorPrueba,
  nombres,
  subir,
} from './ayudantes.js';

// Recorre de punta a punta el uso real de dos personas, como lo haría el frontend.
let servidor;

before(async () => {
  servidor = await iniciarServidorPrueba(crearBaseDatosPrueba());
});

after(async () => {
  await servidor.cerrar();
});

test('flujo completo: Mi espacio, espacio compartido, votación y cuenta', async () => {
  const ana = crearCliente(servidor.url);
  const bea = crearCliente(servidor.url);
  const datos = { contrasena: 'clave-segura-123' };
  const usuarioAna = (await ana.pedir('POST', '/api/auth/registro', { ...datos, nombre: 'Ana', correo: 'ana@deskcloud.test' })).cuerpo.usuario;
  await bea.pedir('POST', '/api/auth/registro', { ...datos, nombre: 'Bea', correo: 'bea@deskcloud.test' });

  // Mi espacio: carpetas sugeridas, subida de una carpeta, edición, versiones, favoritos y papelera.
  assert.deepEqual(await nombres(ana, usuarioAna.raizId), ['Audio', 'Documentos', 'Imágenes', 'Videos']);
  const documentos = (await elementoDe(ana, usuarioAna.raizId, 'Documentos')).id;
  await subir(ana, documentos, 'Tesis/capítulo 1.txt', 'Introducción', { tipo: 'text/plain' });
  const tesis = (await elementoDe(ana, documentos, 'Tesis')).id;
  const capitulo = await elementoDe(ana, tesis, 'capítulo 1.txt');
  assert.equal(capitulo.esTextoEditable, true);

  const abierto = (await ana.pedir('GET', `/api/nodos/${capitulo.id}/texto`)).cuerpo;
  await ana.pedir('PUT', `/api/nodos/${capitulo.id}/texto`, Buffer.from('Introducción corregida'), {
    tipo: 'text/plain; charset=utf-8',
    cabeceras: { 'If-Match': `"${abierto.version.sha256}"` },
  });
  assert.equal((await ana.pedir('GET', `/api/nodos/${capitulo.id}/versiones`)).cuerpo.versiones.length, 2);

  await ana.pedir('POST', '/api/favoritos', { nodoId: tesis });
  await ana.pedir('PUT', `/api/nodos/${tesis}/color`, { color: '#e05757' });
  assert.equal((await elementoDe(ana, documentos, 'Tesis')).color, '#e05757');

  const borrador = (await subir(ana, tesis, 'borrador.txt', 'x')).cuerpo.elemento.id;
  await ana.pedir('POST', '/api/nodos/papelera', { ids: [borrador] });
  assert.equal((await ana.pedir('GET', '/api/papelera')).cuerpo.elementos[0].diasRestantes, 30);

  // Espacio compartido: invitación, trabajo conjunto y copia desde Mi espacio.
  const espacio = (await ana.pedir('POST', '/api/espacios', { nombre: 'Grupo de tesis' })).cuerpo.espacio;
  await ana.pedir('POST', `/api/espacios/${espacio.id}/invitaciones`, { correo: 'bea@deskcloud.test' });
  assert.equal((await bea.pedir('GET', '/api/avisos/resumen')).cuerpo.invitaciones, 1);
  const [invitacion] = (await bea.pedir('GET', '/api/invitaciones')).cuerpo.invitaciones;
  await bea.pedir('POST', `/api/invitaciones/${invitacion.id}/aceptar`);

  await ana.pedir('POST', '/api/nodos/copiar', { ids: [tesis], destinoId: espacio.raizId });
  assert.equal((await bea.pedir('GET', '/api/espacios')).cuerpo.compartidos[0].sinVer, true);
  const tesisCompartida = await elementoDe(bea, espacio.raizId, 'Tesis');
  assert.equal(tesisCompartida.sinVer, true);
  assert.equal(tesisCompartida.color, null);

  const capituloCompartido = (await elementoDe(bea, tesisCompartida.id, 'capítulo 1.txt')).id;
  assert.equal(await descargar(bea, capituloCompartido), 'Introducción corregida');
  await bea.pedir('PUT', `/api/nodos/${tesisCompartida.id}/color`, { color: '#e0b84c', paraTodos: true, nota: 'Revisar antes del viernes' });
  assert.equal((await elementoDe(ana, espacio.raizId, 'Tesis')).notaColor.texto, 'Revisar antes del viernes');

  // Eliminar en el espacio compartido requiere el voto de ambas.
  assert.equal((await bea.pedir('POST', '/api/nodos/papelera', { ids: [capituloCompartido] })).estado, 409);
  const { propuesta } = (
    await bea.pedir('POST', `/api/espacios/${espacio.id}/propuestas`, { tipo: 'eliminar', ids: [capituloCompartido], motivo: 'Duplicado' })
  ).cuerpo;
  assert.ok((await avisos(ana)).some((a) => a.tipo === 'VOTO_PENDIENTE'));
  await ana.pedir('POST', `/api/propuestas/${propuesta.id}/voto`, { voto: 'si' });
  assert.deepEqual(await nombres(ana, tesisCompartida.id), []);
  assert.equal((await ana.pedir('GET', `/api/espacios/${espacio.id}/papelera`)).cuerpo.elementos.length, 1);

  // ZIP de la carpeta original, espacio usado y cierre de cuenta.
  const zip = await ana.pedir('GET', `/api/nodos/${tesis}/zip`);
  assert.equal(zip.estado, 200);
  assert.ok(zip.datos.includes(Buffer.from('Tesis/capítulo 1.txt')));

  const uso = (await ana.pedir('GET', '/api/cuenta/espacio-usado')).cuerpo;
  assert.equal(uso.personal.cantidadArchivos, 1);
  assert.equal(uso.compartidos[0].papelera, Buffer.byteLength('Introducción corregida'));

  assert.equal((await ana.pedir('DELETE', '/api/cuenta', { contrasena: 'clave-segura-123' })).estado, 204);
  const { espacio: final, miembros } = (await bea.pedir('GET', `/api/espacios/${espacio.id}`)).cuerpo;
  assert.equal(final.esAdministrador, true);
  assert.deepEqual(miembros.map((m) => m.nombre), ['Bea']);
  assert.equal((await contenido(bea, espacio.raizId)).elementos.length, 1);
});
