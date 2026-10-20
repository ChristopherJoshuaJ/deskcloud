import { RecursoNoEncontrado, ReglaNegocio } from '../errores.js';
import { crearEspaciosRepository } from '../repositories/espaciosRepository.js';
import { crearNodosRepository } from '../repositories/nodosRepository.js';

export function esCompartido(espacio) {
  return espacio.tipo === 'COMPARTIDO';
}

// Responde "no existe" tanto si algo no existe como si es de un espacio ajeno o está
// en la papelera, para no revelar nada a quien no es dueño ni miembro.
export function crearAutorizacionService(db) {
  const nodos = crearNodosRepository(db);
  const espacios = crearEspaciosRepository(db);

  function puedeEntrar(usuario, espacio) {
    if (!espacio) return false;
    return esCompartido(espacio) ? espacios.esMiembro(espacio.id, usuario.id) : espacio.propietarioId === usuario.id;
  }

  function exigirEspacio(usuario, espacioId) {
    const id = Number(espacioId);
    const espacio = Number.isInteger(id) && id > 0 ? espacios.obtener(id) : null;
    if (!puedeEntrar(usuario, espacio)) {
      throw new RecursoNoEncontrado('El espacio no existe');
    }
    return espacio;
  }

  function exigirCompartido(usuario, espacioId) {
    const espacio = exigirEspacio(usuario, espacioId);
    if (!esCompartido(espacio)) {
      throw new ReglaNegocio('Mi espacio no es un espacio compartido');
    }
    return espacio;
  }

  // Devuelve el nodo, su cadena de ancestros y su espacio.
  function exigirAcceso(usuario, nodoId) {
    const id = Number(nodoId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new RecursoNoEncontrado('El elemento no existe');
    }
    const cadena = nodos.cadena(id);
    const nodo = cadena.at(-1);
    const estaActivo = cadena.length > 0 && cadena[0].esRaiz === 1;
    const espacio = estaActivo ? espacios.obtener(nodo.espacioId) : null;
    if (!puedeEntrar(usuario, espacio)) {
      throw new RecursoNoEncontrado('El elemento no existe');
    }
    return { nodo, cadena, espacio };
  }

  function exigirCarpeta(usuario, nodoId) {
    const acceso = exigirAcceso(usuario, nodoId);
    if (acceso.nodo.tipo !== 'CARPETA') {
      throw new ReglaNegocio('El elemento no es una carpeta');
    }
    return acceso;
  }

  function exigirArchivo(usuario, nodoId) {
    const acceso = exigirAcceso(usuario, nodoId);
    if (acceso.nodo.tipo !== 'ARCHIVO') {
      throw new ReglaNegocio('El elemento no es un archivo');
    }
    return acceso;
  }

  // Un elemento eliminado directamente (no el contenido de una carpeta eliminada).
  function exigirEnPapelera(usuario, nodoId) {
    const id = Number(nodoId);
    const nodo = Number.isInteger(id) && id > 0 ? nodos.obtenerPorId(id) : null;
    const espacio = nodo?.enPapelera === 1 && nodo.padreId === null ? espacios.obtener(nodo.espacioId) : null;
    if (!puedeEntrar(usuario, espacio)) {
      throw new RecursoNoEncontrado('El elemento no está en la papelera');
    }
    return { nodo, espacio };
  }

  return { exigirEspacio, exigirCompartido, exigirAcceso, exigirCarpeta, exigirArchivo, exigirEnPapelera };
}
