import { crearApp } from '../src/app.js';
import { inicializarBaseDatos } from '../src/db/index.js';
import { NOMBRE_COOKIE } from '../src/sesiones/index.js';
import { crearServicios } from '../src/servicios.js';

export const CONFIG_PRUEBAS = {
  tamanoFragmento: 1024,
  secretoSesion: 'secreto-de-pruebas',
  cookieSegura: false,
  duracionSesionMs: 60 * 60 * 1000,
};

export function crearBaseDatosPrueba() {
  return inicializarBaseDatos(':memory:');
}

export async function iniciarServidorPrueba(db, extra = {}) {
  const config = { ...CONFIG_PRUEBAS, ...extra };
  const servicios = crearServicios(db, config);
  const app = crearApp({ db, servicios, config });
  const servidor = await new Promise((resolver) => {
    const s = app.listen(0, () => resolver(s));
  });
  return {
    url: `http://127.0.0.1:${servidor.address().port}`,
    servicios,
    cerrar: () => new Promise((resolver) => servidor.close(resolver)),
  };
}

// Cliente HTTP mínimo que conserva la cookie de sesión como lo haría el navegador.
export function crearCliente(url) {
  let cookie = null;
  return {
    get cookie() {
      return cookie;
    },
    set cookie(valor) {
      cookie = valor;
    },
    // Un Buffer se envía tal cual (subidas); cualquier otro cuerpo se envía como JSON.
    async pedir(metodo, ruta, cuerpo, { tipo, cabeceras: extra = {} } = {}) {
      const cabeceras = { ...extra };
      let body;
      if (Buffer.isBuffer(cuerpo)) {
        body = cuerpo;
        cabeceras['Content-Type'] = tipo ?? 'application/octet-stream';
      } else if (cuerpo !== undefined) {
        body = typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo);
        cabeceras['Content-Type'] = 'application/json';
      }
      if (cookie) cabeceras.Cookie = cookie;

      const respuesta = await fetch(url + ruta, { method: metodo, headers: cabeceras, body });

      const setCookie = respuesta.headers.getSetCookie().find((c) => c.startsWith(`${NOMBRE_COOKIE}=`));
      if (setCookie) {
        const valor = setCookie.split(';')[0];
        cookie = valor === `${NOMBRE_COOKIE}=` ? null : valor;
      }
      const datos = Buffer.from(await respuesta.arrayBuffer());
      const esJson = respuesta.headers.get('content-type')?.includes('application/json');
      return {
        estado: respuesta.status,
        cuerpo: esJson && datos.length > 0 ? JSON.parse(datos.toString('utf8')) : null,
        datos,
        cabeceras: respuesta.headers,
        setCookie,
      };
    },
  };
}

export async function registrar(cliente, correo) {
  const { cuerpo } = await cliente.pedir('POST', '/api/auth/registro', {
    nombre: 'Persona',
    correo,
    contrasena: 'clave-segura-123',
  });
  return cuerpo.usuario;
}

export function subir(cliente, carpetaId, ruta, datos, { conflicto, tipo } = {}) {
  const consulta = new URLSearchParams({ ruta });
  if (conflicto) consulta.set('conflicto', conflicto);
  const cuerpo = Buffer.isBuffer(datos) ? datos : Buffer.from(datos);
  return cliente.pedir('POST', `/api/subidas/${carpetaId}?${consulta}`, cuerpo, { tipo });
}

export async function contenido(cliente, carpetaId) {
  return (await cliente.pedir('GET', `/api/nodos/${carpetaId}/contenido`)).cuerpo;
}

export async function nombres(cliente, carpetaId) {
  return (await contenido(cliente, carpetaId)).elementos.map((e) => e.nombre);
}

export async function idDe(cliente, carpetaId, nombre) {
  return (await contenido(cliente, carpetaId)).elementos.find((e) => e.nombre === nombre)?.id;
}

export async function crearCarpeta(cliente, padreId, nombre) {
  return (await cliente.pedir('POST', `/api/nodos/${padreId}/carpetas`, { nombre })).cuerpo.elemento.id;
}

export async function descargar(cliente, id) {
  return (await cliente.pedir('GET', `/api/nodos/${id}/descarga`)).datos.toString();
}

// Servidor de pruebas con una cuenta registrada y sus carpetas sugeridas.
export async function prepararEspacio() {
  const db = crearBaseDatosPrueba();
  const servidor = await iniciarServidorPrueba(db);
  const cliente = crearCliente(servidor.url);
  const usuario = await registrar(cliente, 'ana@deskcloud.test');
  const raiz = usuario.raizId;
  const carpetas = Object.fromEntries((await contenido(cliente, raiz)).elementos.map((e) => [e.nombre, e.id]));
  return { db, servidor, cliente, usuario, raiz, carpetas };
}

// Ana crea el espacio compartido "Proyecto" e invita a Bea y a Cata, que aceptan.
export async function prepararEquipo() {
  const db = crearBaseDatosPrueba();
  const servidor = await iniciarServidorPrueba(db);
  const personas = {};
  for (const nombre of ['ana', 'bea', 'cata']) {
    const cliente = crearCliente(servidor.url);
    const { cuerpo } = await cliente.pedir('POST', '/api/auth/registro', {
      nombre: nombre[0].toUpperCase() + nombre.slice(1),
      correo: `${nombre}@deskcloud.test`,
      contrasena: 'clave-segura-123',
    });
    personas[nombre] = { cliente, usuario: cuerpo.usuario };
  }
  const { ana, bea, cata } = personas;
  const espacio = (await ana.cliente.pedir('POST', '/api/espacios', { nombre: 'Proyecto' })).cuerpo.espacio;
  for (const invitada of [bea, cata]) {
    await ana.cliente.pedir('POST', `/api/espacios/${espacio.id}/invitaciones`, { correo: invitada.usuario.correo });
    const { invitaciones } = (await invitada.cliente.pedir('GET', '/api/invitaciones')).cuerpo;
    await invitada.cliente.pedir('POST', `/api/invitaciones/${invitaciones[0].id}/aceptar`);
  }
  return { db, servidor, ana: ana.cliente, bea: bea.cliente, cata: cata.cliente, usuarios: personas, espacio };
}

export async function avisos(cliente) {
  return (await cliente.pedir('GET', '/api/avisos')).cuerpo.avisos;
}

export async function elementoDe(cliente, carpetaId, nombre) {
  return (await contenido(cliente, carpetaId)).elementos.find((e) => e.nombre === nombre);
}

export function crearUsuario(db, correo = 'ana@deskcloud.test') {
  const { lastInsertRowid } = db
    .prepare(`INSERT INTO usuarios (nombre, correo, hash_contrasena) VALUES ('Ana', ?, 'hash')`)
    .run(correo);
  return Number(lastInsertRowid);
}

export function crearEspacioPersonal(db, usuarioId) {
  const { lastInsertRowid } = db.prepare(`INSERT INTO espacios (tipo, propietario_id) VALUES ('PERSONAL', ?)`).run(usuarioId);
  return Number(lastInsertRowid);
}

function espacioDe(db, usuarioId) {
  const fila = db.prepare(`SELECT id FROM espacios WHERE tipo = 'PERSONAL' AND propietario_id = ?`).get(usuarioId);
  return fila?.id ?? crearEspacioPersonal(db, usuarioId);
}

// Crea la raíz en el espacio personal del usuario (y el espacio si todavía no existe).
export function crearRaiz(db, usuarioId) {
  const { lastInsertRowid } = db
    .prepare(`INSERT INTO nodos (espacio_id, tipo, nombre, es_raiz) VALUES (?, 'CARPETA', 'ROOT', 1)`)
    .run(espacioDe(db, usuarioId));
  return Number(lastInsertRowid);
}

export function crearNodo(db, { usuarioId, padreId, nombre, tipo = 'ARCHIVO' }) {
  const { lastInsertRowid } = db
    .prepare('INSERT INTO nodos (espacio_id, padre_id, tipo, nombre, creado_por) VALUES (?, ?, ?, ?, ?)')
    .run(espacioDe(db, usuarioId), padreId, tipo, nombre, usuarioId);
  return Number(lastInsertRowid);
}

export function crearEspacioConArchivo(db, nombreArchivo = 'informe.pdf') {
  const usuarioId = crearUsuario(db);
  const raizId = crearRaiz(db, usuarioId);
  const archivoId = crearNodo(db, { usuarioId, padreId: raizId, nombre: nombreArchivo });
  return { usuarioId, raizId, archivoId };
}

export function contar(db, tabla) {
  return db.prepare(`SELECT COUNT(*) AS total FROM ${tabla}`).get().total;
}

export async function leerStream(stream) {
  const partes = [];
  for await (const parte of stream) {
    partes.push(parte);
  }
  return Buffer.concat(partes);
}
