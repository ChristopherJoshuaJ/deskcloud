import { crearActividadRepository } from '../repositories/actividadRepository.js';
import { crearAvisosRepository } from '../repositories/avisosRepository.js';
import { crearEspaciosRepository } from '../repositories/espaciosRepository.js';
import { crearSinVerRepository } from '../repositories/sinVerRepository.js';
import { esCompartido } from './autorizacionService.js';

// Historial de actividad, punto de cambios y avisos de los espacios compartidos.
// En Mi espacio trabaja una sola persona, así que ahí no se registra nada.
export function crearSeguimientoService(db) {
  const espacios = crearEspaciosRepository(db);
  const actividad = crearActividadRepository(db);
  const sinVer = crearSinVerRepository(db);
  const avisos = crearAvisosRepository(db);

  // cambiados: elementos que mostrarán el punto a los demás miembros.
  // Debe ejecutarse dentro de la transacción de la operación.
  function registrar(espacio, usuario, { accion, nodo = null, nombre = null, detalles = {}, cambiados = [] }) {
    if (!esCompartido(espacio)) return;
    actividad.registrar({
      espacioId: espacio.id,
      usuarioId: usuario?.id ?? null,
      accion,
      nodoId: nodo?.id ?? null,
      nombre: nombre ?? nodo?.nombre ?? null,
      detalles,
    });
    const ids = [...new Set(cambiados.filter((id) => id != null))];
    if (ids.length > 0) {
      sinVer.marcar(ids, otrosMiembros(espacio, usuario));
    }
  }

  function otrosMiembros(espacio, usuario) {
    return espacios.idsMiembros(espacio.id).filter((id) => id !== usuario?.id);
  }

  function avisar(usuarioIds, tipo, espacio, datos = {}) {
    if (usuarioIds.length === 0) return;
    avisos.crear({ usuarioIds, tipo, espacioId: espacio?.id ?? null, datos });
  }

  function avisarMiembros(espacio, usuario, tipo, datos = {}) {
    avisar(otrosMiembros(espacio, usuario), tipo, espacio, datos);
  }

  return {
    registrar,
    avisar,
    avisarMiembros,
    otrosMiembros,
    marcarVisto(usuario, nodo) {
      sinVer.marcarVisto(usuario.id, nodo.id);
    },
    marcarSubarbolVisto(usuario, nodo) {
      sinVer.marcarSubarbolVisto(usuario.id, nodo.id);
    },
    // Al salir de la vista del espacio (papelera o eliminación) el punto ya no lleva a ninguna parte.
    quitarSinVerDeSubarbol(nodo) {
      sinVer.quitarSubarbol(nodo.id);
    },
    // Ids de los elementos sin ver y de todas las carpetas que los contienen.
    cambiosDe(usuario) {
      return sinVer.idsConCambios(usuario.id);
    },
  };
}
