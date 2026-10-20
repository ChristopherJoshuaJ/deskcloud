import { enTransaccion } from '../db/index.js';
import { Conflicto, CredencialesInvalidas, DatosInvalidos } from '../errores.js';
import { crearUsuariosRepository } from '../repositories/usuariosRepository.js';
import { cifrarContrasena, verificarContrasena } from './contrasenas.js';

const PATRON_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LONGITUD_MAXIMA_NOMBRE = 80;
const LONGITUD_MAXIMA_CORREO = 254;
const LONGITUD_MINIMA_CONTRASENA = 8;
const LONGITUD_MAXIMA_CONTRASENA = 128;

export function crearAuthService(db, { espacioService }) {
  const usuarios = crearUsuariosRepository(db);
  // Se compara contra este hash cuando el correo no existe, para que la respuesta
  // tarde lo mismo y no revele qué correos están registrados.
  const hashFicticio = cifrarContrasena('contrasena-inexistente');

  function aUsuarioPublico(usuario) {
    const espacio = espacioService.obtenerPersonal(usuario.id);
    return {
      id: usuario.id,
      nombre: usuario.nombre,
      correo: usuario.correo,
      espacioId: espacio?.id ?? null,
      raizId: espacio?.raizId ?? null,
      creadoEn: usuario.creadoEn,
    };
  }

  async function registrar(datos) {
    const { nombre, correo, contrasena } = validarRegistro(datos);
    if (usuarios.obtenerConCredenciales(correo)) {
      throw new Conflicto('Ya existe una cuenta con ese correo');
    }

    const hashContrasena = await cifrarContrasena(contrasena);
    let usuarioId;
    try {
      usuarioId = enTransaccion(db, () => {
        const id = usuarios.crear({ nombre, correo, hashContrasena });
        espacioService.crearEspacio(id);
        return id;
      });
    } catch (error) {
      if (/UNIQUE constraint failed: usuarios\.correo/.test(error.message)) {
        throw new Conflicto('Ya existe una cuenta con ese correo');
      }
      throw error;
    }
    return aUsuarioPublico(usuarios.obtenerPorId(usuarioId));
  }

  async function iniciarSesion(datos) {
    const { correo, contrasena } = validarLogin(datos);
    const usuario = usuarios.obtenerConCredenciales(correo);
    const valida = await verificarContrasena(contrasena, usuario?.hashContrasena ?? (await hashFicticio));
    if (!usuario || !valida) {
      throw new CredencialesInvalidas();
    }
    return aUsuarioPublico(usuario);
  }

  function obtenerUsuario(id) {
    const usuario = usuarios.obtenerPorId(id);
    return usuario ? aUsuarioPublico(usuario) : null;
  }

  return { registrar, iniciarSesion, obtenerUsuario };
}

// Devuelven el mensaje de error o null si el valor es válido.
export function errorNombre(nombre) {
  if (nombre.length === 0) return 'El nombre es obligatorio';
  if (nombre.length > LONGITUD_MAXIMA_NOMBRE) return `El nombre no puede superar los ${LONGITUD_MAXIMA_NOMBRE} caracteres`;
  return null;
}

export function errorContrasena(contrasena) {
  if (contrasena.length < LONGITUD_MINIMA_CONTRASENA) {
    return `La contraseña debe tener al menos ${LONGITUD_MINIMA_CONTRASENA} caracteres`;
  }
  if (contrasena.length > LONGITUD_MAXIMA_CONTRASENA) {
    return `La contraseña no puede superar los ${LONGITUD_MAXIMA_CONTRASENA} caracteres`;
  }
  return null;
}

function validarRegistro(datos) {
  const detalles = {};
  const nombre = texto(datos?.nombre).trim();
  const correo = texto(datos?.correo).trim().toLowerCase();
  const contrasena = texto(datos?.contrasena);

  const problemaNombre = errorNombre(nombre);
  if (problemaNombre) detalles.nombre = problemaNombre;

  if (correo.length === 0) {
    detalles.correo = 'El correo es obligatorio';
  } else if (correo.length > LONGITUD_MAXIMA_CORREO || !PATRON_CORREO.test(correo)) {
    detalles.correo = 'El correo no es válido';
  }

  const problemaContrasena = errorContrasena(contrasena);
  if (problemaContrasena) detalles.contrasena = problemaContrasena;

  if (Object.keys(detalles).length > 0) {
    throw new DatosInvalidos(detalles);
  }
  return { nombre, correo, contrasena };
}

function validarLogin(datos) {
  const correo = texto(datos?.correo).trim().toLowerCase();
  const contrasena = texto(datos?.contrasena);

  const detalles = {};
  if (correo.length === 0) detalles.correo = 'El correo es obligatorio';
  if (contrasena.length === 0) detalles.contrasena = 'La contraseña es obligatoria';
  if (Object.keys(detalles).length > 0) {
    throw new DatosInvalidos(detalles);
  }
  if (contrasena.length > LONGITUD_MAXIMA_CONTRASENA) {
    throw new CredencialesInvalidas();
  }
  return { correo, contrasena };
}

export function texto(valor) {
  return typeof valor === 'string' ? valor : '';
}
