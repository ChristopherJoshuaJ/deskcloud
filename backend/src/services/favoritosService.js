import { enTransaccion } from '../db/index.js';
import { DatosInvalidos, RecursoNoEncontrado, ReglaNegocio } from '../errores.js';
import { crearFavoritosRepository } from '../repositories/favoritosRepository.js';
import { aElemento, leerIds } from './destinos.js';

// Los accesos rápidos son de cada usuario y pueden apuntar a carpetas de cualquier espacio al que pertenece.
export function crearFavoritosService(db, { autorizacion, seguimiento }) {
  const favoritos = crearFavoritosRepository(db);

  function accesible(usuario, nodoId) {
    try {
      autorizacion.exigirCarpeta(usuario, nodoId);
      return true;
    } catch (error) {
      if (error instanceof RecursoNoEncontrado) return false;
      throw error;
    }
  }

  function listar(usuario) {
    const cambios = seguimiento.cambiosDe(usuario);
    return favoritos
      .listar(usuario.id)
      .filter((fila) => accesible(usuario, fila.id))
      .map((fila) => aElemento(fila, cambios));
  }

  function fijar(usuario, datos = {}) {
    const { nodo } = autorizacion.exigirCarpeta(usuario, datos.nodoId);
    if (nodo.esRaiz) {
      throw new ReglaNegocio('La raíz de un espacio ya aparece siempre en la barra lateral');
    }
    favoritos.agregar(usuario.id, nodo.id);
    return listar(usuario);
  }

  function quitar(usuario, nodoId) {
    favoritos.quitar(usuario.id, Number(nodoId));
    return listar(usuario);
  }

  // ids debe contener exactamente los accesos rápidos actuales, en el orden nuevo.
  function reordenar(usuario, datos = {}) {
    const ids = leerIds(datos.ids);
    const actuales = new Set(favoritos.idsDe(usuario.id));
    if (ids.length !== actuales.size || ids.some((id) => !actuales.has(id))) {
      throw new DatosInvalidos({ ids: 'La lista debe contener exactamente los accesos rápidos actuales' });
    }
    enTransaccion(db, () => {
      ids.forEach((id, orden) => favoritos.cambiarOrden(usuario.id, id, orden));
    });
    return listar(usuario);
  }

  return { listar, fijar, quitar, reordenar };
}
