import { createHash } from 'node:crypto';
import { enTransaccion } from '../db/index.js';
import { DatosInvalidos, RecursoNoEncontrado, ReglaNegocio } from '../errores.js';
import { crearEspaciosRepository } from '../repositories/espaciosRepository.js';
import { crearNodosRepository } from '../repositories/nodosRepository.js';
import { crearSesionesRepository } from '../repositories/sesionesRepository.js';
import { crearUsuariosRepository } from '../repositories/usuariosRepository.js';
import { errorContrasena, errorNombre, texto } from './authService.js';
import { cifrarContrasena, verificarContrasena } from './contrasenas.js';

const LONGITUD_MAXIMA_CONTRASENA = 128;

// El identificador real de una sesión es el valor de la cookie; hacia afuera solo se muestra un resumen.
function idPublico(sesionId) {
  return createHash('sha256').update(sesionId).digest('hex').slice(0, 16);
}

export function crearCuentaService(db, { auth, compartidos }) {
  const usuarios = crearUsuariosRepository(db);
  const sesiones = crearSesionesRepository(db);
  const espacios = crearEspaciosRepository(db);
  const nodos = crearNodosRepository(db);

  async function exigirContrasena(usuario, contrasena, campo) {
    const valida =
      typeof contrasena === 'string' &&
      contrasena.length > 0 &&
      contrasena.length <= LONGITUD_MAXIMA_CONTRASENA &&
      (await verificarContrasena(contrasena, usuarios.hashContrasena(usuario.id)));
    if (!valida) {
      throw new DatosInvalidos({ [campo]: 'La contraseña no es correcta' });
    }
  }

  function cambiarNombre(usuario, datos = {}) {
    const nombre = texto(datos.nombre).trim();
    const error = errorNombre(nombre);
    if (error) throw new DatosInvalidos({ nombre: error });
    usuarios.cambiarNombre(usuario.id, nombre);
    return auth.obtenerUsuario(usuario.id);
  }

  // Pide la contraseña actual y cierra las demás sesiones, por si alguien más la conocía.
  async function cambiarContrasena(usuario, datos = {}, sesionActualId) {
    await exigirContrasena(usuario, datos.actual, 'actual');
    const nueva = texto(datos.nueva);
    const error = errorContrasena(nueva);
    if (error) throw new DatosInvalidos({ nueva: error });
    const hash = await cifrarContrasena(nueva);
    const sesionesCerradas = enTransaccion(db, () => {
      usuarios.cambiarContrasena(usuario.id, hash);
      return sesiones.eliminarOtras(usuario.id, sesionActualId);
    });
    return { sesionesCerradas };
  }

  // Borra Mi espacio con todo su contenido y saca a la persona de sus espacios compartidos,
  // que siguen existiendo para los demás miembros.
  async function eliminarCuenta(usuario, datos = {}) {
    await exigirContrasena(usuario, datos.contrasena, 'contrasena');
    enTransaccion(db, () => {
      compartidos.salirDeTodos(usuario);
      usuarios.eliminar(usuario.id);
    });
  }

  function listarSesiones(usuario, sesionActualId) {
    return sesiones.deUsuario(usuario.id).map((fila) => ({
      id: idPublico(fila.id),
      navegador: fila.navegador,
      creadaEn: fila.creadaEn,
      ultimoUso: fila.ultimoUso == null ? null : new Date(fila.ultimoUso).toISOString(),
      actual: fila.id === sesionActualId,
    }));
  }

  function cerrarSesion(usuario, id, sesionActualId) {
    const fila = sesiones.deUsuario(usuario.id).find((sesion) => idPublico(sesion.id) === id);
    if (!fila) {
      throw new RecursoNoEncontrado('La sesión no existe');
    }
    if (fila.id === sesionActualId) {
      throw new ReglaNegocio('Para cerrar la sesión actual usa "cerrar sesión"');
    }
    sesiones.eliminar(fila.id, usuario.id);
    return listarSesiones(usuario, sesionActualId);
  }

  function cerrarOtras(usuario, sesionActualId) {
    return { sesionesCerradas: sesiones.eliminarOtras(usuario.id, sesionActualId) };
  }

  // Solo informativo: no hay cuotas. Cada espacio compartido se cuenta aparte, no en Mi espacio.
  function espacioUsado(usuario) {
    const uso = (espacio) => ({ id: espacio.id, nombre: espacio.nombre, ...nodos.uso(espacio.id) });
    const personal = { ...uso(espacios.personalDe(usuario.id)), nombre: 'Mi espacio' };
    return { personal, compartidos: espacios.compartidosDe(usuario.id).map(uso) };
  }

  return { cambiarNombre, cambiarContrasena, eliminarCuenta, listarSesiones, cerrarSesion, cerrarOtras, espacioUsado };
}
