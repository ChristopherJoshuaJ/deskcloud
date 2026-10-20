import { crearAvisosRepository } from '../repositories/avisosRepository.js';
import { crearEspaciosRepository } from '../repositories/espaciosRepository.js';
import { crearPropuestasRepository } from '../repositories/propuestasRepository.js';
import { leerIds } from './destinos.js';

const LIMITE_AVISOS = 50;
const LIMITE_MAXIMO_AVISOS = 200;

// Avisos dentro de la app. El frontend consulta el resumen cada cierto tiempo para el contador.
export function crearAvisosService(db, { propuestas }) {
  const avisos = crearAvisosRepository(db);
  const espacios = crearEspaciosRepository(db);
  const votos = crearPropuestasRepository(db);

  function listar(usuario, consulta = {}) {
    const limite = Math.min(Math.max(Number.parseInt(consulta.limite, 10) || LIMITE_AVISOS, 1), LIMITE_MAXIMO_AVISOS);
    const antesDe = Number.parseInt(consulta.antesDe, 10) || null;
    return {
      avisos: avisos.listar(usuario.id, { antesDe, limite }).map((fila) => ({
        id: fila.id,
        tipo: fila.tipo,
        espacioId: fila.espacioId,
        datos: JSON.parse(fila.datos),
        leido: fila.leido === 1,
        creadoEn: fila.creadoEn,
      })),
      noLeidos: avisos.noLeidos(usuario.id),
    };
  }

  function resumen(usuario) {
    propuestas.cerrarVencidas();
    return {
      noLeidos: avisos.noLeidos(usuario.id),
      invitaciones: espacios.invitacionesDeUsuario(usuario.id).length,
      votosPendientes: votos.totalPendientesDe(usuario.id),
    };
  }

  // Sin ids marca todos como leídos.
  function marcarLeidos(usuario, datos = {}) {
    avisos.marcarLeidos(usuario.id, datos.ids === undefined ? null : leerIds(datos.ids));
    return { noLeidos: avisos.noLeidos(usuario.id) };
  }

  return { listar, resumen, marcarLeidos };
}
