import { enTransaccion } from '../db/index.js';
import { Conflicto, ConfirmacionRequerida, DatosInvalidos, Prohibido, RecursoNoEncontrado, ReglaNegocio } from '../errores.js';
import { crearActividadRepository } from '../repositories/actividadRepository.js';
import { crearColoresRepository } from '../repositories/coloresRepository.js';
import { crearEspaciosRepository } from '../repositories/espaciosRepository.js';
import { crearFavoritosRepository } from '../repositories/favoritosRepository.js';
import { crearNodosRepository } from '../repositories/nodosRepository.js';
import { crearPropuestasRepository } from '../repositories/propuestasRepository.js';
import { crearSinVerRepository } from '../repositories/sinVerRepository.js';
import { crearUsuariosRepository } from '../repositories/usuariosRepository.js';
import { validarNombre } from './nombres.js';

const LIMITE_ACTIVIDAD = 50;
const LIMITE_MAXIMO_ACTIVIDAD = 200;

// Espacios compartidos: un disco aparte que no pertenece a ningún miembro.
// Quien lo crea es el administrador y el único que invita y saca miembros.
export function crearCompartidosService(db, { autorizacion, seguimiento, papelera, propuestas }) {
  const espacios = crearEspaciosRepository(db);
  const nodos = crearNodosRepository(db);
  const usuarios = crearUsuariosRepository(db);
  const actividad = crearActividadRepository(db);
  const colores = crearColoresRepository(db);
  const sinVer = crearSinVerRepository(db);
  const favoritos = crearFavoritosRepository(db);
  const votos = crearPropuestasRepository(db);

  function aResumen(espacio, usuario, cambios) {
    return {
      id: espacio.id,
      nombre: espacio.nombre,
      raizId: espacio.raizId,
      administrador:
        espacio.administradorId == null ? null : { id: espacio.administradorId, nombre: espacio.administradorNombre },
      esAdministrador: espacio.administradorId === usuario.id,
      totalMiembros: espacio.totalMiembros,
      sinVer: cambios.has(espacio.raizId),
      votosPendientes: votos.totalPendientesDe(usuario.id, espacio.id),
      creadoEn: espacio.creadoEn,
    };
  }

  function exigirAdministrador(usuario, espacioId) {
    const espacio = autorizacion.exigirCompartido(usuario, espacioId);
    if (espacio.administradorId !== usuario.id) {
      throw new Prohibido('Solo el administrador del espacio puede hacer esto');
    }
    return espacio;
  }

  // Mi espacio y los espacios compartidos de los que el usuario es miembro, para la barra lateral.
  function listar(usuario) {
    propuestas.cerrarVencidas();
    const personal = espacios.personalDe(usuario.id);
    const cambios = seguimiento.cambiosDe(usuario);
    return {
      personal: { id: personal.id, raizId: personal.raizId, nombre: 'Mi espacio' },
      compartidos: espacios.compartidosDe(usuario.id).map((espacio) => aResumen(espacio, usuario, cambios)),
    };
  }

  function detalles(usuario, espacioId) {
    const espacio = autorizacion.exigirCompartido(usuario, espacioId);
    const resumen = espacios.compartidosDe(usuario.id).find((fila) => fila.id === espacio.id);
    return {
      espacio: aResumen(resumen, usuario, seguimiento.cambiosDe(usuario)),
      miembros: espacios.miembros(espacio.id).map((miembro) => ({
        id: miembro.id,
        nombre: miembro.nombre,
        correo: miembro.correo,
        unidoEn: miembro.unidoEn,
        esAdministrador: miembro.id === espacio.administradorId,
      })),
      invitaciones: espacios.invitacionesDeEspacio(espacio.id).map((fila) => ({
        id: fila.id,
        invitado: { id: fila.invitadoId, nombre: fila.invitadoNombre, correo: fila.invitadoCorreo },
        invitadoPor: fila.invitadoPorId == null ? null : { id: fila.invitadoPorId, nombre: fila.invitadoPorNombre },
        creadoEn: fila.creadoEn,
      })),
    };
  }

  function crear(usuario, datos = {}) {
    const nombre = validarNombre(datos.nombre);
    const espacioId = enTransaccion(db, () => {
      const id = espacios.crearCompartido(usuario.id);
      nodos.crear({ espacioId: id, tipo: 'CARPETA', nombre, esRaiz: true, creadoPor: usuario.id });
      espacios.agregarMiembro(id, usuario.id);
      seguimiento.registrar(espacios.obtener(id), usuario, { accion: 'CREAR_ESPACIO', nombre });
      return id;
    });
    return detalles(usuario, espacioId);
  }

  // Cualquier miembro puede renombrar el espacio; queda en el historial.
  function renombrar(usuario, espacioId, datos = {}) {
    const espacio = autorizacion.exigirCompartido(usuario, espacioId);
    const nombre = validarNombre(datos.nombre);
    enTransaccion(db, () => {
      nodos.renombrar(espacio.raizId, nombre);
      seguimiento.registrar(espacio, usuario, {
        accion: 'RENOMBRAR_ESPACIO',
        nombre,
        detalles: { nombreAnterior: espacio.nombre },
        cambiados: [espacio.raizId],
      });
    });
    return detalles(usuario, espacio.id);
  }

  function invitar(usuario, espacioId, datos = {}) {
    const espacio = exigirAdministrador(usuario, espacioId);
    const correo = typeof datos.correo === 'string' ? datos.correo.trim().toLowerCase() : '';
    if (correo.length === 0) {
      throw new DatosInvalidos({ correo: 'El correo es obligatorio' });
    }
    const invitado = usuarios.obtenerConCredenciales(correo);
    if (!invitado) {
      throw new RecursoNoEncontrado('No hay ninguna cuenta con ese correo');
    }
    if (espacios.esMiembro(espacio.id, invitado.id)) {
      throw new Conflicto(`${invitado.nombre} ya es miembro del espacio`);
    }
    if (espacios.existeInvitacion(espacio.id, invitado.id)) {
      throw new Conflicto(`${invitado.nombre} ya tiene una invitación pendiente`);
    }
    enTransaccion(db, () => {
      const invitacionId = espacios.crearInvitacion(espacio.id, invitado.id, usuario.id);
      seguimiento.registrar(espacio, usuario, { accion: 'INVITAR', nombre: invitado.nombre });
      seguimiento.avisar([invitado.id], 'INVITACION', espacio, {
        invitacionId,
        espacioNombre: espacio.nombre,
        invitadoPor: usuario.nombre,
      });
    });
    return detalles(usuario, espacio.id);
  }

  function cancelarInvitacion(usuario, espacioId, invitacionId) {
    const espacio = exigirAdministrador(usuario, espacioId);
    const invitacion = espacios.obtenerInvitacion(Number(invitacionId));
    if (!invitacion || invitacion.espacioId !== espacio.id) {
      throw new RecursoNoEncontrado('La invitación no existe');
    }
    espacios.eliminarInvitacion(invitacion.id);
    return detalles(usuario, espacio.id);
  }

  function misInvitaciones(usuario) {
    return espacios.invitacionesDeUsuario(usuario.id).map((fila) => ({
      id: fila.id,
      espacio: { id: fila.espacioId, nombre: fila.espacioNombre, totalMiembros: fila.totalMiembros },
      invitadoPor: fila.invitadoPorId == null ? null : { id: fila.invitadoPorId, nombre: fila.invitadoPorNombre },
      creadoEn: fila.creadoEn,
    }));
  }

  function exigirInvitacionPropia(usuario, invitacionId) {
    const invitacion = espacios.obtenerInvitacion(Number(invitacionId));
    if (!invitacion || invitacion.invitadoId !== usuario.id) {
      throw new RecursoNoEncontrado('La invitación no existe');
    }
    return invitacion;
  }

  function aceptar(usuario, invitacionId) {
    const invitacion = exigirInvitacionPropia(usuario, invitacionId);
    const espacio = espacios.obtener(invitacion.espacioId);
    enTransaccion(db, () => {
      espacios.eliminarInvitacion(invitacion.id);
      espacios.agregarMiembro(espacio.id, usuario.id);
      seguimiento.registrar(espacio, usuario, { accion: 'UNIRSE', nombre: usuario.nombre });
    });
    return detalles(usuario, espacio.id);
  }

  function rechazar(usuario, invitacionId) {
    const invitacion = exigirInvitacionPropia(usuario, invitacionId);
    espacios.eliminarInvitacion(invitacion.id);
    return { invitaciones: misInvitaciones(usuario) };
  }

  // Quita a un miembro y todo lo suyo dentro del espacio. Si era el último, el espacio se elimina;
  // si era el administrador, el rol pasa al miembro más antiguo. Debe ejecutarse dentro de una transacción.
  function retirarMiembro(espacio, usuarioId, { accion, actor }) {
    espacios.quitarMiembro(espacio.id, usuarioId);
    const restantes = espacios.miembros(espacio.id);
    if (restantes.length === 0) {
      espacios.eliminar(espacio.id);
      return { eliminado: true };
    }
    colores.quitarDeUsuarioEnEspacio(usuarioId, espacio.id);
    sinVer.quitarDeUsuarioEnEspacio(usuarioId, espacio.id);
    favoritos.quitarDeEspacio(usuarioId, espacio.id);
    votos.quitarVotosDe(usuarioId, espacio.id);

    const retirado = usuarios.obtenerPorId(usuarioId);
    seguimiento.registrar(espacio, actor, { accion, nombre: retirado?.nombre ?? null });
    if (espacio.administradorId === usuarioId) {
      const nuevo = restantes[0];
      espacios.cambiarAdministrador(espacio.id, nuevo.id);
      seguimiento.registrar(espacio, null, { accion: 'NUEVO_ADMINISTRADOR', nombre: nuevo.nombre });
      seguimiento.avisar([nuevo.id], 'ADMINISTRADOR', espacio, { espacioNombre: espacio.nombre });
    }
    propuestas.reevaluarEspacio(espacio);
    return { eliminado: false };
  }

  function expulsar(usuario, espacioId, usuarioId) {
    const espacio = exigirAdministrador(usuario, espacioId);
    const id = Number(usuarioId);
    if (id === usuario.id) {
      throw new ReglaNegocio('Para dejar el espacio usa "salir"');
    }
    if (!espacios.esMiembro(espacio.id, id)) {
      throw new RecursoNoEncontrado('Esa persona no es miembro del espacio');
    }
    enTransaccion(db, () => {
      retirarMiembro(espacio, id, { accion: 'EXPULSAR', actor: usuario });
      seguimiento.avisar([id], 'EXPULSADO', null, { espacioNombre: espacio.nombre });
    });
    return detalles(usuario, espacio.id);
  }

  // El último miembro debe confirmar, porque al salir se elimina el espacio con todo su contenido.
  function salir(usuario, espacioId, datos = {}) {
    const espacio = autorizacion.exigirCompartido(usuario, espacioId);
    if (espacios.idsMiembros(espacio.id).length === 1 && datos.confirmar !== true) {
      throw new ConfirmacionRequerida('Eres el último miembro: si sales, el espacio y todo su contenido se eliminan');
    }
    return enTransaccion(db, () => retirarMiembro(espacio, usuario.id, { accion: 'SALIR', actor: usuario }));
  }

  // Al eliminar una cuenta, la persona sale de todos sus espacios compartidos.
  // Debe ejecutarse dentro de una transacción.
  function salirDeTodos(usuario) {
    for (const espacioId of espacios.idsEspaciosCompartidosDe(usuario.id)) {
      retirarMiembro(espacios.obtener(espacioId), usuario.id, { accion: 'SALIR', actor: usuario });
    }
  }

  function listarActividad(usuario, espacioId, consulta = {}) {
    const espacio = autorizacion.exigirCompartido(usuario, espacioId);
    const limite = Math.min(Math.max(Number.parseInt(consulta.limite, 10) || LIMITE_ACTIVIDAD, 1), LIMITE_MAXIMO_ACTIVIDAD);
    const antesDe = Number.parseInt(consulta.antesDe, 10) || null;
    return actividad.listar(espacio.id, { antesDe, limite }).map((fila) => ({
      id: fila.id,
      accion: fila.accion,
      usuario: fila.usuarioId == null ? null : { id: fila.usuarioId, nombre: fila.usuarioNombre },
      nodoId: fila.nodoId,
      nombre: fila.nombre,
      detalles: JSON.parse(fila.detalles),
      creadoEn: fila.creadoEn,
    }));
  }

  function listarPapelera(usuario, espacioId) {
    const espacio = autorizacion.exigirCompartido(usuario, espacioId);
    return papelera.listarDe(espacio, usuario);
  }

  return {
    listar,
    detalles,
    crear,
    renombrar,
    invitar,
    cancelarInvitacion,
    misInvitaciones,
    aceptar,
    rechazar,
    expulsar,
    salir,
    salirDeTodos,
    listarActividad,
    listarPapelera,
  };
}
