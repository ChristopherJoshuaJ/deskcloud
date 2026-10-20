import { VistaNoDisponible } from '../errores.js';
import { crearNodosRepository } from '../repositories/nodosRepository.js';
import { nombreVisible } from './destinos.js';
import { nombreDeVersion } from './nombres.js';
import { tipoContenidoVista, tipoVista } from './tiposMime.js';
import { crearZip } from './zip.js';

// Sin scripts ni recursos externos si alguien abre la vista directamente en el navegador.
// El PDF queda fuera porque el visor de PDF del navegador no funciona en modo sandbox.
const POLITICA_VISTA = "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox";

export function crearContenidoService(db, { autorizacion, almacenamiento, seguimiento }) {
  const nodos = crearNodosRepository(db);

  // Sin versionId se usa la versión actual; una versión anterior se descarga con su número en el nombre.
  // Abrir o descargar un archivo cuenta como haberlo visto.
  function resolver(usuario, nodoId, versionId) {
    const { nodo } = autorizacion.exigirArchivo(usuario, nodoId);
    seguimiento.marcarVisto(usuario, nodo);
    if (versionId === undefined) {
      return { version: almacenamiento.obtenerVersionActual(nodo.id), nombre: nodo.nombre };
    }
    const version = almacenamiento.versionDe(nodo.id, versionId);
    const nombre = version.id === nodo.versionActualId ? nodo.nombre : nombreDeVersion(nodo.nombre, version.numero);
    return { version, nombre };
  }

  function paraDescarga(usuario, nodoId, versionId) {
    const { version, nombre } = resolver(usuario, nodoId, versionId);
    return {
      version,
      nombre,
      disposicion: 'attachment',
      tipoContenido: version.mime ?? 'application/octet-stream',
    };
  }

  function paraVista(usuario, nodoId, versionId) {
    const { version, nombre } = resolver(usuario, nodoId, versionId);
    const tipo = tipoVista(version.mime);
    if (!tipo) {
      throw new VistaNoDisponible();
    }
    return {
      version,
      nombre,
      disposicion: 'inline',
      tipoContenido: tipoContenidoVista(version.mime),
      cabeceras: tipo === 'pdf' ? {} : { 'Content-Security-Policy': POLITICA_VISTA },
    };
  }

  // La carpeta completa como ZIP, con la carpeta misma como primer nivel. Cuenta como ver todo lo de dentro.
  function paraZip(usuario, carpetaId) {
    const { nodo } = autorizacion.exigirCarpeta(usuario, carpetaId);
    const raiz = nombreVisible(nodo);
    const entradas = nodos.arbol(nodo.id).map((fila) => ({
      ruta: `${raiz}/${fila.ruta}`,
      esCarpeta: fila.tipo === 'CARPETA',
      tamano: fila.tamano ?? 0,
      fecha: fila.modificadoEn,
      leer: () => almacenamiento.partes(fila.versionId),
    }));
    const zip = crearZip([{ ruta: raiz, esCarpeta: true, fecha: nodo.modificadoEn }, ...entradas]);
    seguimiento.marcarSubarbolVisto(usuario, nodo);
    return { nombre: `${raiz}.zip`, ...zip };
  }

  return { paraDescarga, paraVista, paraZip };
}
