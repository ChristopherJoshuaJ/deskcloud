import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { enTransaccion } from '../db/index.js';
import { ErrorIntegridad, RangoInvalido, RecursoNoEncontrado, ReglaNegocio, VersionDesactualizada } from '../errores.js';
import { crearFragmentosRepository } from '../repositories/fragmentosRepository.js';
import { crearNodosRepository } from '../repositories/nodosRepository.js';
import { crearVersionesRepository } from '../repositories/versionesRepository.js';

export function crearAlmacenamientoService(db, { tamanoFragmento }) {
  if (!Number.isInteger(tamanoFragmento) || tamanoFragmento <= 0) {
    throw new TypeError('tamanoFragmento debe ser un entero positivo');
  }

  const nodos = crearNodosRepository(db);
  const versiones = crearVersionesRepository(db);
  const fragmentos = crearFragmentosRepository(db);

  function obtenerArchivo(nodoId) {
    const nodo = nodos.obtenerPorId(nodoId);
    if (!nodo) {
      throw new RecursoNoEncontrado('El archivo no existe');
    }
    if (nodo.tipo !== 'ARCHIVO') {
      throw new ReglaNegocio('El elemento no es un archivo');
    }
    return nodo;
  }

  function obtenerVersion(versionId) {
    const version = versiones.obtenerPorId(versionId);
    if (!version || version.estado !== 'COMPLETA') {
      throw new RecursoNoEncontrado('La versión no existe');
    }
    return version;
  }

  function obtenerVersionActual(nodoId) {
    const nodo = obtenerArchivo(nodoId);
    if (nodo.versionActualId == null) {
      throw new RecursoNoEncontrado('El archivo todavía no tiene contenido');
    }
    return obtenerVersion(nodo.versionActualId);
  }

  // Versión de un archivo concreto; si es de otro archivo responde igual que si no existiera.
  function versionDe(nodoId, versionId) {
    const id = Number(versionId);
    const version = Number.isInteger(id) && id > 0 ? versiones.obtenerPorId(id) : null;
    if (!version || version.estado !== 'COMPLETA' || version.nodoId !== nodoId) {
      throw new RecursoNoEncontrado('La versión no existe');
    }
    return version;
  }

  // Recibe el contenido por partes (stream de una subida o Buffer), lo corta en
  // fragmentos de tamaño fijo y los guarda a medida que llegan, sin cargar el archivo entero en memoria.
  // Con versionBaseId la versión solo se acepta si el archivo sigue en esa versión al terminar.
  async function guardarContenido({ nodoId, contenido, mime = null, usuarioId = null, versionBaseId }) {
    obtenerArchivo(nodoId);
    const versionId = versiones.crearPendiente({ nodoId, tamanoFragmento, mime, creadoPor: usuarioId });

    const hash = createHash('sha256');
    let tamano = 0;
    let indice = 0;
    let pendientes = [];
    let bytesPendientes = 0;

    try {
      for await (const trozo of comoIterable(contenido)) {
        const datos = Buffer.isBuffer(trozo) ? trozo : Buffer.from(trozo);
        if (datos.length === 0) continue;

        hash.update(datos);
        tamano += datos.length;
        pendientes.push(datos);
        bytesPendientes += datos.length;

        if (bytesPendientes >= tamanoFragmento) {
          const acumulado = Buffer.concat(pendientes, bytesPendientes);
          let inicio = 0;
          while (acumulado.length - inicio >= tamanoFragmento) {
            fragmentos.insertar(versionId, indice++, acumulado.subarray(inicio, inicio + tamanoFragmento));
            inicio += tamanoFragmento;
          }
          const resto = acumulado.subarray(inicio);
          pendientes = resto.length > 0 ? [resto] : [];
          bytesPendientes = resto.length;
        }
      }
      if (bytesPendientes > 0) {
        fragmentos.insertar(versionId, indice++, Buffer.concat(pendientes, bytesPendientes));
      }

      const sha256 = hash.digest('hex');
      return enTransaccion(db, () => {
        if (versionBaseId !== undefined && nodos.obtenerPorId(nodoId)?.versionActualId !== versionBaseId) {
          throw new VersionDesactualizada();
        }
        const numero = versiones.siguienteNumero(nodoId);
        const completada = versiones.completar({ id: versionId, numero, tamano, totalFragmentos: indice, sha256 });
        if (!completada || !nodos.establecerVersionActual(nodoId, versionId)) {
          throw new RecursoNoEncontrado('El archivo fue eliminado durante la subida');
        }
        return versiones.obtenerPorId(versionId);
      });
    } catch (error) {
      versiones.eliminar(versionId);
      throw error;
    }
  }

  // inicio y fin son posiciones de byte inclusivas, igual que en la cabecera HTTP Range.
  function abrirLectura(versionId, { inicio, fin } = {}) {
    const version = obtenerVersion(versionId);
    const rango = normalizarRango(version.tamano, inicio, fin);
    return {
      version,
      ...rango,
      stream: Readable.from(leerRango(version, rango)),
    };
  }

  function* leerRango(version, { inicio, fin, longitud }) {
    if (longitud === 0) return;

    const primero = Math.floor(inicio / version.tamanoFragmento);
    const ultimo = Math.floor(fin / version.tamanoFragmento);
    for (let i = primero; i <= ultimo; i++) {
      const datos = fragmentos.obtener(version.id, i);
      if (!datos) {
        throw new ErrorIntegridad(`Falta el fragmento ${i} de la versión ${version.id}`);
      }
      const base = i * version.tamanoFragmento;
      const desde = Math.max(inicio - base, 0);
      const hasta = Math.min(fin - base + 1, datos.length);
      yield Buffer.from(datos.buffer, datos.byteOffset + desde, hasta - desde);
    }
  }

  // Lee en memoria; para archivos grandes usar abrirLectura.
  function leer(versionId, { inicio, fin } = {}) {
    const version = obtenerVersion(versionId);
    const rango = normalizarRango(version.tamano, inicio, fin);
    return Buffer.concat([...leerRango(version, rango)], rango.longitud);
  }

  function leerCompleto(versionId) {
    return leer(versionId);
  }

  // Recorre todo el contenido fragmento a fragmento, sin juntarlo en memoria.
  function partes(versionId) {
    const version = obtenerVersion(versionId);
    return leerRango(version, normalizarRango(version.tamano));
  }

  function verificarIntegridad(versionId) {
    const version = obtenerVersion(versionId);
    const hash = createHash('sha256');
    let tamano = 0;
    for (let i = 0; i < version.totalFragmentos; i++) {
      const datos = fragmentos.obtener(version.id, i);
      if (!datos) {
        return false;
      }
      hash.update(datos);
      tamano += datos.length;
    }
    return tamano === version.tamano && hash.digest('hex') === version.sha256;
  }

  function listarVersiones(nodoId) {
    obtenerArchivo(nodoId);
    return versiones.historial(nodoId);
  }

  // Restaurar no reescribe el historial: crea una versión nueva con el contenido de la antigua,
  // así la versión actual siempre es la de número más alto y nada se pierde.
  function restaurarVersion(nodoId, versionId, usuarioId = null) {
    return enTransaccion(db, () => {
      const nodo = obtenerArchivo(nodoId);
      const origen = versionDe(nodo.id, versionId);
      if (origen.id === nodo.versionActualId) {
        throw new ReglaNegocio('Esa ya es la versión actual');
      }
      const copiaId = versiones.insertarCopia(origen, {
        nodoId: nodo.id,
        numero: versiones.siguienteNumero(nodo.id),
        restauradaDe: origen.numero,
        creadoPor: usuarioId,
      });
      fragmentos.copiar(origen.id, copiaId);
      nodos.establecerVersionActual(nodo.id, copiaId);
      return versiones.obtenerPorId(copiaId);
    });
  }

  function eliminarVersion(nodoId, versionId) {
    enTransaccion(db, () => {
      const nodo = obtenerArchivo(nodoId);
      const version = versionDe(nodo.id, versionId);
      if (version.id === nodo.versionActualId) {
        throw new ReglaNegocio('No se puede eliminar la versión actual');
      }
      versiones.eliminar(version.id);
    });
  }

  // Debe ejecutarse dentro de una transacción.
  function duplicarVersion(versionId, nodoDestinoId, usuarioId = null) {
    const origen = obtenerVersion(versionId);
    const copiaId = versiones.insertarCopia(origen, { nodoId: nodoDestinoId, creadoPor: usuarioId });
    fragmentos.copiar(origen.id, copiaId);
    nodos.establecerVersionActual(nodoDestinoId, copiaId);
    return copiaId;
  }

  function limpiarPendientes() {
    return versiones.eliminarPendientes();
  }

  return {
    guardarContenido,
    abrirLectura,
    leer,
    leerCompleto,
    partes,
    verificarIntegridad,
    obtenerVersion,
    obtenerVersionActual,
    versionDe,
    listarVersiones,
    restaurarVersion,
    eliminarVersion,
    duplicarVersion,
    limpiarPendientes,
  };
}

function comoIterable(contenido) {
  if (typeof contenido === 'string' || contenido instanceof Uint8Array) {
    return [Buffer.from(contenido)];
  }
  if (contenido && (Symbol.asyncIterator in contenido || Symbol.iterator in contenido)) {
    return contenido;
  }
  throw new TypeError('El contenido debe ser un Buffer, un texto o un stream');
}

function normalizarRango(tamano, inicio, fin) {
  if (tamano === 0) {
    if ((inicio ?? 0) !== 0 || fin != null) {
      throw new RangoInvalido();
    }
    return { inicio: 0, fin: -1, longitud: 0 };
  }

  const desde = inicio ?? 0;
  const hasta = Math.min(fin ?? tamano - 1, tamano - 1);
  if (!Number.isInteger(desde) || !Number.isInteger(hasta) || desde < 0 || desde > hasta) {
    throw new RangoInvalido();
  }
  return { inicio: desde, fin: hasta, longitud: hasta - desde + 1 };
}
