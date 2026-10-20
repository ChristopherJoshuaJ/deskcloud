import { enTransaccion } from '../db/index.js';
import { VotacionRequerida } from '../errores.js';
import { crearNodosRepository } from '../repositories/nodosRepository.js';
import { esCompartido } from './autorizacionService.js';
import { aElemento } from './destinos.js';
import { tipoVista } from './tiposMime.js';

export function crearVersionesService(db, { autorizacion, almacenamiento, seguimiento }) {
  const nodos = crearNodosRepository(db);

  function aVersion(fila, versionActualId) {
    return {
      id: fila.id,
      numero: fila.numero,
      tamano: fila.tamano,
      mime: fila.mime,
      tipoVista: tipoVista(fila.mime),
      sha256: fila.sha256,
      autor: fila.autorId == null ? null : { id: fila.autorId, nombre: fila.autorNombre },
      restauradaDe: fila.restauradaDe,
      esActual: fila.id === versionActualId,
      creadoEn: fila.creadoEn,
    };
  }

  function historial(nodo) {
    const actual = nodos.obtenerPorId(nodo.id);
    return almacenamiento.listarVersiones(nodo.id).map((fila) => aVersion(fila, actual.versionActualId));
  }

  function listar(usuario, nodoId) {
    const { nodo } = autorizacion.exigirArchivo(usuario, nodoId);
    return historial(nodo);
  }

  function restaurar(usuario, nodoId, versionId) {
    const { nodo, espacio } = autorizacion.exigirArchivo(usuario, nodoId);
    const nueva = almacenamiento.restaurarVersion(nodo.id, versionId, usuario.id);
    enTransaccion(db, () =>
      seguimiento.registrar(espacio, usuario, {
        accion: 'RESTAURAR_VERSION',
        nodo,
        detalles: { desde: nueva.restauradaDe, version: nueva.numero },
        cambiados: [nodo.id],
      }),
    );
    return {
      version: historial(nodo).find((version) => version.id === nueva.id),
      elemento: aElemento(nodos.obtenerElemento(nodo.id, usuario.id)),
    };
  }

  function eliminar(usuario, nodoId, versionId) {
    const { nodo, espacio } = autorizacion.exigirArchivo(usuario, nodoId);
    if (esCompartido(espacio)) {
      throw new VotacionRequerida('En un espacio compartido las versiones anteriores no se eliminan');
    }
    almacenamiento.eliminarVersion(nodo.id, versionId);
    return historial(nodo);
  }

  return { listar, restaurar, eliminar };
}
