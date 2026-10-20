import { enTransaccion } from '../db/index.js';
import { Conflicto, DatosInvalidos, Prohibido, RecursoNoEncontrado, ReglaNegocio } from '../errores.js';
import { crearEspaciosRepository } from '../repositories/espaciosRepository.js';
import { crearNodosRepository } from '../repositories/nodosRepository.js';
import { crearPropuestasRepository } from '../repositories/propuestasRepository.js';
import { esCompartido } from './autorizacionService.js';
import { leerIds } from './destinos.js';

export const DURACION_VOTACION_MS = 7 * 24 * 60 * 60 * 1000;
const AVISO_ANTES_DE_VENCER_MS = 24 * 60 * 60 * 1000;
const LONGITUD_MAXIMA_MOTIVO = 500;
const TIPOS = ['ELIMINAR', 'RESTAURAR', 'ELIMINAR_DEFINITIVO'];
const LIMITE_HISTORIAL = 100;

// Votaciones de los espacios compartidos. Votan los miembros que había al proponer; quien
// propone ya cuenta como sí, un "no" se puede cambiar y la propuesta se aprueba cuando todos
// votaron sí. Si en 7 días no se logra, vence y se rechaza.
export function crearPropuestasService(db, { autorizacion, seguimiento, papelera }) {
  const propuestas = crearPropuestasRepository(db);
  const nodos = crearNodosRepository(db);
  const espacios = crearEspaciosRepository(db);

  function aPropuesta(fila, usuario) {
    const votos = propuestas.votos(fila.id);
    const miVoto = votos.find((voto) => voto.usuarioId === usuario.id);
    return {
      id: fila.id,
      espacioId: fila.espacioId,
      tipo: fila.tipo,
      estado: fila.estado,
      motivo: fila.motivo,
      propuestoPor: fila.propuestoPorId == null ? null : { id: fila.propuestoPorId, nombre: fila.propuestoPorNombre },
      elementos: propuestas.nodos(fila.id).map((nodo) => ({ id: nodo.nodoId, nombre: nodo.nombre, tipo: nodo.tipo })),
      votos: votos.map((voto) => ({
        usuario: { id: voto.usuarioId, nombre: voto.usuarioNombre },
        voto: voto.voto,
        votadoEn: voto.votadoEn,
      })),
      recuento: {
        si: votos.filter((voto) => voto.voto === 'SI').length,
        no: votos.filter((voto) => voto.voto === 'NO').length,
        pendientes: votos.filter((voto) => voto.voto === null).length,
        total: votos.length,
      },
      miVoto: miVoto ? miVoto.voto : null,
      puedoVotar: fila.estado === 'ABIERTA' && miVoto !== undefined,
      creadaEn: fila.creadaEn,
      expiraEn: fila.expiraEn,
      cerradaEn: fila.cerradaEn,
    };
  }

  function exigirPropuesta(usuario, propuestaId) {
    const id = Number(propuestaId);
    const fila = Number.isInteger(id) && id > 0 ? propuestas.obtener(id) : null;
    if (!fila) {
      throw new RecursoNoEncontrado('La propuesta no existe');
    }
    try {
      return { fila, espacio: autorizacion.exigirEspacio(usuario, fila.espacioId) };
    } catch (error) {
      if (error instanceof RecursoNoEncontrado) throw new RecursoNoEncontrado('La propuesta no existe');
      throw error;
    }
  }

  function leerTipo(valor) {
    const tipo = typeof valor === 'string' ? valor.trim().toUpperCase() : '';
    if (!TIPOS.includes(tipo)) {
      throw new DatosInvalidos({ tipo: `Debe ser uno de: ${TIPOS.join(', ').toLowerCase()}` });
    }
    return tipo;
  }

  function leerMotivo(valor) {
    if (valor == null) return null;
    const motivo = typeof valor === 'string' ? valor.trim() : '';
    if (motivo.length > LONGITUD_MAXIMA_MOTIVO) {
      throw new DatosInvalidos({ motivo: `El motivo no puede superar los ${LONGITUD_MAXIMA_MOTIVO} caracteres` });
    }
    return motivo.length > 0 ? motivo : null;
  }

  // Para eliminar: elementos activos del espacio, sin repetir lo que ya viaja dentro de una carpeta elegida.
  function elementosActivos(usuario, espacio, ids) {
    const accesos = ids.map((id) => autorizacion.exigirAcceso(usuario, id));
    for (const { nodo, espacio: suyo } of accesos) {
      if (suyo.id !== espacio.id) throw new RecursoNoEncontrado('El elemento no existe');
      if (nodo.esRaiz) throw new ReglaNegocio('No se puede eliminar la raíz del espacio');
    }
    const elegidos = new Set(accesos.map(({ nodo }) => nodo.id));
    return accesos
      .filter(({ cadena }) => !cadena.slice(0, -1).some((ancestro) => elegidos.has(ancestro.id)))
      .map(({ nodo }) => nodo);
  }

  function elementosEnPapelera(usuario, espacio, datos) {
    if (datos.todos === true) {
      const todos = nodos.listarPapelera(espacio.id, usuario.id);
      if (todos.length === 0) throw new ReglaNegocio('La papelera está vacía');
      return todos;
    }
    return leerIds(datos.ids).map((id) => {
      const { nodo, espacio: suyo } = autorizacion.exigirEnPapelera(usuario, id);
      if (suyo.id !== espacio.id) throw new RecursoNoEncontrado('El elemento no está en la papelera');
      return nodo;
    });
  }

  function proponer(usuario, espacioId, datos = {}) {
    const espacio = autorizacion.exigirEspacio(usuario, espacioId);
    if (!esCompartido(espacio)) {
      throw new ReglaNegocio('En Mi espacio no hace falta votar');
    }
    const tipo = leerTipo(datos.tipo);
    const motivo = leerMotivo(datos.motivo);
    if (datos.todos === true && tipo !== 'ELIMINAR_DEFINITIVO') {
      throw new DatosInvalidos({ todos: 'Solo se puede proponer vaciar la papelera completa' });
    }
    const elementos =
      tipo === 'ELIMINAR' ? elementosActivos(usuario, espacio, leerIds(datos.ids)) : elementosEnPapelera(usuario, espacio, datos);

    cerrarVencidas();
    const ocupados = propuestas.enPropuestaAbierta(tipo, elementos.map((nodo) => nodo.id));
    if (ocupados.length > 0) {
      throw new Conflicto(`"${ocupados[0].nombre}" ya tiene una votación abierta para lo mismo`);
    }

    const id = enTransaccion(db, () => {
      const nueva = propuestas.crear({
        espacioId: espacio.id,
        tipo,
        propuestoPor: usuario.id,
        motivo,
        expiraEn: new Date(Date.now() + DURACION_VOTACION_MS).toISOString(),
        elementos,
        votantes: espacios.idsMiembros(espacio.id),
      });
      const resumen = resumenDe(tipo, elementos, nueva, motivo);
      seguimiento.registrar(espacio, usuario, {
        accion: 'PROPONER',
        nodo: elementos.length === 1 ? elementos[0] : null,
        nombre: resumen.nombres,
        detalles: resumen,
        cambiados: tipo === 'ELIMINAR' ? elementos.map((nodo) => nodo.id) : [],
      });
      seguimiento.avisarMiembros(espacio, usuario, 'VOTO_PENDIENTE', {
        ...resumen,
        espacioNombre: espacio.nombre,
        propuestoPor: usuario.nombre,
      });
      evaluar(nueva, espacio, usuario);
      return nueva;
    });
    return aPropuesta(propuestas.obtener(id), usuario);
  }

  function resumenDe(tipo, elementos, propuestaId, motivo) {
    const nombres = elementos.length === 1 ? elementos[0].nombre : `${elementos.length} elementos`;
    return { propuestaId, tipo, nombres, cantidad: elementos.length, motivo };
  }

  function votar(usuario, propuestaId, datos = {}) {
    const voto = typeof datos.voto === 'string' ? datos.voto.trim().toUpperCase() : '';
    if (voto !== 'SI' && voto !== 'NO') {
      throw new DatosInvalidos({ voto: 'Debe ser "si" o "no"' });
    }
    cerrarVencidas();
    const { fila, espacio } = exigirPropuesta(usuario, propuestaId);
    if (fila.estado !== 'ABIERTA') {
      throw new Conflicto('La votación ya terminó');
    }
    enTransaccion(db, () => {
      if (!propuestas.votar(fila.id, usuario.id, voto)) {
        throw new Prohibido('Entraste al espacio después de esta propuesta, así que no votas en ella');
      }
      seguimiento.registrar(espacio, usuario, {
        accion: 'VOTAR',
        detalles: { propuestaId: fila.id, tipo: fila.tipo, voto },
      });
      evaluar(fila.id, espacio, usuario);
    });
    return aPropuesta(propuestas.obtener(fila.id), usuario);
  }

  function retirar(usuario, propuestaId) {
    cerrarVencidas();
    const { fila, espacio } = exigirPropuesta(usuario, propuestaId);
    if (fila.estado !== 'ABIERTA') {
      throw new Conflicto('La votación ya terminó');
    }
    if (fila.propuestoPorId !== usuario.id) {
      throw new Prohibido('Solo quien hizo la propuesta puede retirarla');
    }
    enTransaccion(db, () => {
      propuestas.cerrar(fila.id, 'RETIRADA');
      cerrada(fila, espacio, usuario, 'PROPUESTA_RETIRADA');
    });
    return aPropuesta(propuestas.obtener(fila.id), usuario);
  }

  // Comprueba si ya votaron todos que sí y, en ese caso, ejecuta lo propuesto.
  // Debe ejecutarse dentro de una transacción.
  function evaluar(propuestaId, espacio, usuario = null) {
    const { total, si } = propuestas.recuento(propuestaId);
    const fila = propuestas.obtener(propuestaId);
    if (total === 0) {
      propuestas.cerrar(propuestaId, 'ANULADA');
      cerrada(fila, espacio, usuario, 'PROPUESTA_ANULADA');
    } else if (si === total) {
      const resultado = ejecutar(fila, espacio);
      propuestas.cerrar(propuestaId, 'APROBADA');
      cerrada(fila, espacio, usuario, 'PROPUESTA_APROBADA', resultado);
    }
  }

  // usuario es quien provocó el cierre (null si venció sola); no recibe aviso de su propia acción.
  function cerrada(fila, espacio, usuario, accion, { ejecutados = null, cambiados = [] } = {}) {
    const elementos = propuestas.nodos(fila.id);
    const nombres = elementos.length === 1 ? elementos[0].nombre : `${elementos.length} elementos`;
    const datos = { propuestaId: fila.id, tipo: fila.tipo, nombres, ejecutados };
    seguimiento.registrar(espacio, usuario, { accion, nombre: nombres, detalles: datos, cambiados });
    seguimiento.avisarMiembros(espacio, usuario, accion, { ...datos, espacioNombre: espacio.nombre });
  }

  // Los elementos que cambiaron de situación mientras se votaba (por ejemplo, ya se
  // eliminaron por otra votación) se saltan.
  function ejecutar(fila, espacio) {
    const actuales = propuestas
      .nodos(fila.id)
      .map((item) => (item.nodoId == null ? null : nodos.obtenerPorId(item.nodoId)))
      .filter((nodo) => nodo && nodo.espacioId === espacio.id);
    const cambiados = [];

    if (fila.tipo === 'ELIMINAR') {
      const activos = actuales.filter((nodo) => nodo.enPapelera === 0 && nodos.cadena(nodo.id)[0]?.esRaiz === 1);
      for (const nodo of activos) {
        nodos.enviarAPapelera(nodo.id);
        seguimiento.quitarSinVerDeSubarbol(nodo);
        cambiados.push(nodo.padreId);
      }
      return { ejecutados: activos.length, cambiados };
    }

    const enPapelera = actuales.filter((nodo) => nodo.enPapelera === 1 && nodo.padreId === null);
    if (fila.tipo === 'RESTAURAR') {
      for (const { id, destinoId } of papelera.restaurarEn(espacio, enPapelera)) {
        cambiados.push(id, destinoId);
      }
    } else {
      for (const nodo of enPapelera) nodos.eliminar(nodo.id);
    }
    return { ejecutados: enPapelera.length, cambiados };
  }

  function listar(usuario, espacioId, { estado } = {}) {
    const espacio = autorizacion.exigirCompartido(usuario, espacioId);
    cerrarVencidas();
    const abiertas = estado !== 'cerradas';
    return propuestas.deEspacio(espacio.id, { abiertas, limite: LIMITE_HISTORIAL }).map((fila) => aPropuesta(fila, usuario));
  }

  function obtener(usuario, propuestaId) {
    cerrarVencidas();
    return aPropuesta(exigirPropuesta(usuario, propuestaId).fila, usuario);
  }

  // Propuestas abiertas en las que el usuario todavía no votó.
  function pendientes(usuario) {
    cerrarVencidas();
    return propuestas.pendientesDe(usuario.id).map((fila) => aPropuesta(fila, usuario));
  }

  function cerrarVencidas() {
    enTransaccion(db, () => {
      for (const id of propuestas.vencer()) {
        const fila = propuestas.obtener(id);
        cerrada(fila, espacios.obtener(fila.espacioId), null, 'PROPUESTA_VENCIDA');
      }
    });
  }

  // Avisa una sola vez, un día antes de vencer, a quienes todavía no votaron que sí.
  function avisarPorVencer() {
    enTransaccion(db, () => {
      const limite = new Date(Date.now() + AVISO_ANTES_DE_VENCER_MS).toISOString();
      for (const id of propuestas.marcarPorVencer(limite)) {
        const fila = propuestas.obtener(id);
        const espacio = espacios.obtener(fila.espacioId);
        const faltan = propuestas.votos(id).filter((voto) => voto.voto !== 'SI').map((voto) => voto.usuarioId);
        const elementos = propuestas.nodos(id);
        seguimiento.avisar(faltan, 'PROPUESTA_POR_VENCER', espacio, {
          propuestaId: id,
          tipo: fila.tipo,
          nombres: elementos.length === 1 ? elementos[0].nombre : `${elementos.length} elementos`,
          expiraEn: fila.expiraEn,
          espacioNombre: espacio.nombre,
        });
      }
    });
  }

  // Cuando alguien sale del espacio su voto deja de contar y una propuesta puede quedar aprobada.
  // Debe ejecutarse dentro de una transacción.
  function reevaluarEspacio(espacio) {
    for (const id of propuestas.idsAbiertasDeEspacio(espacio.id)) evaluar(id, espacio);
  }

  return { proponer, votar, retirar, listar, obtener, pendientes, cerrarVencidas, avisarPorVencer, reevaluarEspacio };
}
