import { enTransaccion } from '../db/index.js';
import { VotacionRequerida } from '../errores.js';
import { crearNodosRepository } from '../repositories/nodosRepository.js';
import { esCompartido } from './autorizacionService.js';
import { aElemento, aRuta, crearDestinos, leerIds } from './destinos.js';

export const DIAS_EN_PAPELERA = 30;
const DIA_MS = 24 * 60 * 60 * 1000;

// Cada espacio tiene su papelera. En ella solo aparecen los elementos que se eliminaron
// directamente; el contenido de una carpeta eliminada viaja dentro de ella.
// La papelera de Mi espacio se maneja aquí; en un espacio compartido restaurar y eliminar
// definitivamente se hacen por votación (propuestasService), que usa restaurarEn.
export function crearPapeleraService(db, { autorizacion, espacioService }) {
  const nodos = crearNodosRepository(db);
  const destinos = crearDestinos(nodos);

  // La carpeta original sirve como destino solo si sigue existiendo fuera de la papelera del mismo espacio.
  function ubicacionOriginal(espacio, padreOriginalId) {
    if (padreOriginalId == null) return null;
    const cadena = nodos.cadena(padreOriginalId);
    const valida = cadena.length > 0 && cadena[0].esRaiz === 1 && cadena[0].espacioId === espacio.id;
    return valida ? cadena : null;
  }

  // En Mi espacio cada elemento indica cuándo se borrará solo; en los compartidos nada se borra sin votación.
  function listarDe(espacio, usuario) {
    const ahora = Date.now();
    return nodos.listarPapelera(espacio.id, usuario.id).map((fila) => {
      const cadena = ubicacionOriginal(espacio, fila.padreOriginalId);
      const seEliminaEn = esCompartido(espacio) ? null : Date.parse(fila.eliminadoEn) + DIAS_EN_PAPELERA * DIA_MS;
      return {
        ...aElemento(fila),
        eliminadoEn: fila.eliminadoEn,
        ubicacionOriginal: cadena ? aRuta(cadena) : null,
        seEliminaEn: seEliminaEn === null ? null : new Date(seEliminaEn).toISOString(),
        diasRestantes: seEliminaEn === null ? null : Math.max(0, Math.ceil((seEliminaEn - ahora) / DIA_MS)),
      };
    });
  }

  // Borra lo que lleva más de 30 días en la papelera de Mi espacio. Devuelve cuántos elementos borró.
  function purgarVencidos() {
    const limite = new Date(Date.now() - DIAS_EN_PAPELERA * DIA_MS).toISOString();
    return enTransaccion(db, () => nodos.purgarPapelerasPersonales(limite));
  }

  // Vuelve a la carpeta original o, si ya no existe, a la raíz del espacio.
  // Si el nombre está ocupado en el destino se renombra automáticamente ("Informe (2)").
  // Devuelve [{ id, destinoId }]. Debe ejecutarse dentro de una transacción.
  function restaurarEn(espacio, elementos) {
    const porDestino = new Map();
    for (const nodo of elementos) {
      const destinoId = ubicacionOriginal(espacio, nodo.padreOriginalId) ? nodo.padreOriginalId : espacio.raizId;
      porDestino.set(destinoId, [...(porDestino.get(destinoId) ?? []), nodo]);
    }
    const restaurados = [];
    for (const [destinoId, grupo] of porDestino) {
      for (const paso of destinos.planificar(destinoId, grupo, 'conservar')) {
        nodos.restaurar(paso.nodo.id, destinoId, paso.nombre);
        restaurados.push({ id: paso.nodo.id, destinoId });
      }
    }
    return restaurados;
  }

  function personal(usuario) {
    return espacioService.obtenerPersonal(usuario.id);
  }

  function exigirEnPapeleraPersonal(usuario, id) {
    const { nodo, espacio } = autorizacion.exigirEnPapelera(usuario, id);
    if (esCompartido(espacio)) {
      throw new VotacionRequerida();
    }
    return nodo;
  }

  function listar(usuario) {
    return listarDe(personal(usuario), usuario);
  }

  function restaurar(usuario, datos = {}) {
    const elementos = leerIds(datos.ids).map((id) => exigirEnPapeleraPersonal(usuario, id));
    const restaurados = enTransaccion(db, () => restaurarEn(personal(usuario), elementos));
    return { elementos: restaurados.map(({ id }) => aElemento(nodos.obtenerElemento(id, usuario.id))) };
  }

  function eliminarDefinitivamente(usuario, datos = {}) {
    const elementos = leerIds(datos.ids).map((id) => exigirEnPapeleraPersonal(usuario, id));
    enTransaccion(db, () => {
      for (const nodo of elementos) nodos.eliminar(nodo.id);
    });
    return { eliminados: elementos.length };
  }

  function vaciar(usuario) {
    return { eliminados: enTransaccion(db, () => nodos.vaciarPapelera(personal(usuario).id)) };
  }

  return { listar, listarDe, restaurarEn, restaurar, eliminarDefinitivamente, vaciar, purgarVencidos };
}
