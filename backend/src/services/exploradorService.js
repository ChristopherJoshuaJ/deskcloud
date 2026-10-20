import { enTransaccion } from '../db/index.js';
import { DatosInvalidos, NombreEnUso, ReglaNegocio, VotacionRequerida } from '../errores.js';
import { crearNodosRepository } from '../repositories/nodosRepository.js';
import { esCompartido } from './autorizacionService.js';
import { aElemento, aRuta, crearDestinos, leerIds, leerPoliticaConflicto } from './destinos.js';
import { dividirRuta, validarNombre } from './nombres.js';

const LIMITE_BUSQUEDA = 200;
const LONGITUD_MAXIMA_BUSQUEDA = 100;

export function crearExploradorService(db, { autorizacion, almacenamiento, seguimiento }) {
  const nodos = crearNodosRepository(db);
  const destinos = crearDestinos(nodos);

  function elemento(id, usuario, cambios = null) {
    return aElemento(nodos.obtenerElemento(id, usuario.id), cambios);
  }

  // Valida una selección múltiple y quita los elementos cuyo ancestro también está seleccionado,
  // porque ya viajan con él. Todos deben ser del mismo espacio.
  function seleccionar(usuario, idsCrudos) {
    const accesos = leerIds(idsCrudos).map((id) => autorizacion.exigirAcceso(usuario, id));
    for (const { nodo } of accesos) {
      if (nodo.esRaiz) {
        throw new ReglaNegocio('No se puede modificar la raíz del espacio');
      }
    }
    const espacio = accesos[0].espacio;
    if (accesos.some((acceso) => acceso.espacio.id !== espacio.id)) {
      throw new ReglaNegocio('Los elementos seleccionados deben estar en el mismo espacio');
    }
    const seleccionados = new Set(accesos.map(({ nodo }) => nodo.id));
    const seleccion = accesos.filter(({ cadena }) => !cadena.slice(0, -1).some((ancestro) => seleccionados.has(ancestro.id)));
    return { seleccion, espacio };
  }

  function impedirCiclos(seleccion, cadenaDestino, verbo) {
    for (const { nodo } of seleccion) {
      if (cadenaDestino.some((ancestro) => ancestro.id === nodo.id)) {
        throw new ReglaNegocio(`No se puede ${verbo} "${nodo.nombre}" dentro de sí misma`);
      }
    }
  }

  // Reemplazar al mover o copiar envía el elemento existente a la papelera, y en un espacio
  // compartido eso solo se hace por votación.
  function impedirReemplazoCompartido(politica, espacioDestino) {
    if (politica === 'reemplazar' && esCompartido(espacioDestino)) {
      throw new VotacionRequerida(
        'En un espacio compartido no se puede reemplazar al mover o copiar, porque eliminaría el elemento existente',
      );
    }
  }

  // Abrir una carpeta cuenta como haberla visto, pero no a lo que tiene dentro.
  function contenido(usuario, carpetaId) {
    const { nodo, cadena } = autorizacion.exigirCarpeta(usuario, carpetaId);
    seguimiento.marcarVisto(usuario, nodo);
    const cambios = seguimiento.cambiosDe(usuario);
    return {
      carpeta: elemento(nodo.id, usuario, cambios),
      ruta: aRuta(cadena),
      elementos: nodos.listarContenido(nodo.id, usuario.id).map((fila) => aElemento(fila, cambios)),
    };
  }

  function subcarpetas(usuario, carpetaId) {
    const { nodo } = autorizacion.exigirCarpeta(usuario, carpetaId);
    const cambios = seguimiento.cambiosDe(usuario);
    return nodos.listarSubcarpetas(nodo.id, usuario.id).map((fila) => ({
      ...aElemento(fila, cambios),
      tieneSubcarpetas: fila.tieneSubcarpetas === 1,
    }));
  }

  function detalles(usuario, nodoId) {
    const { nodo, cadena } = autorizacion.exigirAcceso(usuario, nodoId);
    return {
      elemento: elemento(nodo.id, usuario, seguimiento.cambiosDe(usuario)),
      ruta: aRuta(cadena),
      resumen: nodo.tipo === 'CARPETA' ? nodos.resumenCarpeta(nodo.id) : null,
    };
  }

  function buscar(usuario, carpetaId, texto) {
    const { nodo } = autorizacion.exigirCarpeta(usuario, carpetaId);
    const consulta = typeof texto === 'string' ? texto.trim() : '';
    if (consulta.length === 0 || consulta.length > LONGITUD_MAXIMA_BUSQUEDA) {
      throw new DatosInvalidos({ q: `Escribe entre 1 y ${LONGITUD_MAXIMA_BUSQUEDA} caracteres` });
    }
    const patron = `%${consulta.replace(/[\\%_]/g, '\\$&')}%`;
    const filas = nodos.buscar({ carpetaId: nodo.id, patron, limite: LIMITE_BUSQUEDA, usuarioId: usuario.id });
    const cambios = seguimiento.cambiosDe(usuario);
    return filas.map((fila) => ({ ...aElemento(fila, cambios), ubicacion: fila.ubicacion }));
  }

  function crearCarpeta(usuario, padreId, datos = {}) {
    const { nodo: padre, espacio } = autorizacion.exigirCarpeta(usuario, padreId);
    const origen = { espacioId: padre.espacioId, creadoPor: usuario.id };

    if (datos.ruta !== undefined) {
      const segmentos = dividirRuta(datos.ruta);
      const id = enTransaccion(db, () => {
        const creada = destinos.asegurarCarpetas(padre.id, segmentos, origen);
        seguimiento.registrar(espacio, usuario, {
          accion: 'CREAR_CARPETA',
          nodo: { id: creada, nombre: segmentos.at(-1) },
          detalles: { ruta: segmentos.join('/') },
          cambiados: [creada, padre.id],
        });
        return creada;
      });
      return elemento(id, usuario);
    }

    const nombre = validarNombre(datos.nombre);
    const id = enTransaccion(db, () => {
      const choque = destinos.conflictoDeNombre(padre.id, nombre, 'CARPETA');
      if (choque) {
        throw new NombreEnUso([choque.conflicto]);
      }
      const creada = nodos.crear({ ...origen, padreId: padre.id, tipo: 'CARPETA', nombre });
      seguimiento.registrar(espacio, usuario, {
        accion: 'CREAR_CARPETA',
        nodo: { id: creada, nombre },
        cambiados: [creada, padre.id],
      });
      return creada;
    });
    return elemento(id, usuario);
  }

  function renombrar(usuario, nodoId, datos = {}) {
    const { nodo, espacio } = autorizacion.exigirAcceso(usuario, nodoId);
    if (nodo.esRaiz) {
      throw new ReglaNegocio('No se puede renombrar la raíz del espacio');
    }
    const nombre = validarNombre(datos.nombre);
    enTransaccion(db, () => {
      const choque = destinos.conflictoDeNombre(nodo.padreId, nombre, nodo.tipo, nodo.id);
      if (choque) {
        throw new NombreEnUso([choque.conflicto]);
      }
      nodos.renombrar(nodo.id, nombre);
      seguimiento.registrar(espacio, usuario, {
        accion: 'RENOMBRAR',
        nodo: { id: nodo.id, nombre },
        detalles: { nombreAnterior: nodo.nombre },
        cambiados: [nodo.id],
      });
    });
    return elemento(nodo.id, usuario);
  }

  function mover(usuario, datos = {}) {
    const politica = leerPoliticaConflicto(datos.conflicto);
    const destinoAcceso = autorizacion.exigirCarpeta(usuario, datos.destinoId);
    const { nodo: destino, cadena: cadenaDestino } = destinoAcceso;
    const { seleccion, espacio } = seleccionar(usuario, datos.ids);
    if (espacio.id !== destinoAcceso.espacio.id) {
      throw new ReglaNegocio('Entre espacios distintos solo se puede copiar');
    }
    impedirReemplazoCompartido(politica, espacio);
    impedirCiclos(seleccion, cadenaDestino, 'mover');

    const aMover = seleccion.map(({ nodo }) => nodo).filter((nodo) => nodo.padreId !== destino.id);
    const { movidos, omitidos } = enTransaccion(db, () => {
      const plan = destinos.planificar(destino.id, aMover, politica);
      const ids = [];
      for (const paso of plan) {
        if (paso.omitir) continue;
        if (paso.reemplazar) nodos.enviarAPapelera(paso.reemplazar.id);
        nodos.mover(paso.nodo.id, destino.id, paso.nombre);
        seguimiento.registrar(espacio, usuario, {
          accion: 'MOVER',
          nodo: { id: paso.nodo.id, nombre: paso.nombre },
          detalles: { destino: aRuta(cadenaDestino).map((parte) => parte.nombre).join(' / ') },
          cambiados: [paso.nodo.id, paso.nodo.padreId, destino.id],
        });
        ids.push(paso.nodo.id);
      }
      return { movidos: ids, omitidos: plan.length - ids.length };
    });
    return { elementos: movidos.map((id) => elemento(id, usuario)), omitidos };
  }

  // Dentro del mismo espacio la copia conserva el color; hacia otro espacio llega sin color.
  function copiarSubarbol(origen, padreId, nombre, { espacioId, conservarColor }, usuario) {
    const copiaId = nodos.crear({
      espacioId,
      padreId,
      tipo: origen.tipo,
      nombre,
      color: conservarColor ? origen.color : null,
      creadoPor: usuario.id,
    });
    if (origen.tipo === 'ARCHIVO') {
      almacenamiento.duplicarVersion(origen.versionActualId, copiaId, usuario.id);
    } else {
      for (const hijo of nodos.hijosVisibles(origen.id)) {
        copiarSubarbol(hijo, copiaId, hijo.nombre, { espacioId, conservarColor }, usuario);
      }
    }
    return copiaId;
  }

  function copiar(usuario, datos = {}) {
    const politica = leerPoliticaConflicto(datos.conflicto);
    const destinoAcceso = autorizacion.exigirCarpeta(usuario, datos.destinoId);
    const { nodo: destino, cadena: cadenaDestino, espacio: espacioDestino } = destinoAcceso;
    const { seleccion, espacio: espacioOrigen } = seleccionar(usuario, datos.ids);
    impedirReemplazoCompartido(politica, espacioDestino);
    impedirCiclos(seleccion, cadenaDestino, 'copiar');
    const opciones = { espacioId: espacioDestino.id, conservarColor: espacioOrigen.id === espacioDestino.id };

    const { copias, omitidos } = enTransaccion(db, () => {
      const plan = destinos.planificar(destino.id, seleccion.map(({ nodo }) => nodo), politica);
      const ids = [];
      for (const paso of plan) {
        if (paso.omitir) continue;
        if (paso.reemplazar) nodos.enviarAPapelera(paso.reemplazar.id);
        const copiaId = copiarSubarbol(paso.nodo, destino.id, paso.nombre, opciones, usuario);
        seguimiento.registrar(espacioDestino, usuario, {
          accion: 'COPIAR',
          nodo: { id: copiaId, nombre: paso.nombre },
          detalles: { desdeOtroEspacio: espacioOrigen.id !== espacioDestino.id },
          cambiados: [copiaId, destino.id],
        });
        ids.push(copiaId);
      }
      return { copias: ids, omitidos: plan.length - ids.length };
    });
    return { elementos: copias.map((id) => elemento(id, usuario)), omitidos };
  }

  function enviarAPapelera(usuario, datos = {}) {
    const { seleccion, espacio } = seleccionar(usuario, datos.ids);
    if (esCompartido(espacio)) {
      throw new VotacionRequerida();
    }
    const eliminados = enTransaccion(db, () =>
      seleccion.filter(({ nodo }) => nodos.enviarAPapelera(nodo.id)).length,
    );
    return { eliminados };
  }

  // "Marcar como visto"; con incluirContenido, también todo lo que hay dentro de las carpetas.
  function marcarVisto(usuario, datos = {}) {
    const accesos = leerIds(datos.ids).map((id) => autorizacion.exigirAcceso(usuario, id));
    for (const { nodo } of accesos) {
      if (datos.incluirContenido === true && nodo.tipo === 'CARPETA') {
        seguimiento.marcarSubarbolVisto(usuario, nodo);
      } else {
        seguimiento.marcarVisto(usuario, nodo);
      }
    }
  }

  function limpiarArchivosSinContenido() {
    return nodos.eliminarArchivosSinContenido();
  }

  return {
    contenido,
    subcarpetas,
    detalles,
    buscar,
    crearCarpeta,
    renombrar,
    mover,
    copiar,
    enviarAPapelera,
    marcarVisto,
    limpiarArchivosSinContenido,
  };
}
