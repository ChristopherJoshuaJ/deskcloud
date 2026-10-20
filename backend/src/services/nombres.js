import { DatosInvalidos } from '../errores.js';

const LONGITUD_MAXIMA = 255;
const CARACTERES_PROHIBIDOS = /[\\/:*?"<>|\u0000-\u001f]/;

export const NOMBRE_RAIZ_VISIBLE = 'Mi espacio';

export function validarNombre(valor, campo = 'nombre') {
  const nombre = typeof valor === 'string' ? valor.trim() : '';
  let error = null;
  if (nombre.length === 0) {
    error = 'El nombre es obligatorio';
  } else if (nombre.length > LONGITUD_MAXIMA) {
    error = `El nombre no puede superar los ${LONGITUD_MAXIMA} caracteres`;
  } else if (CARACTERES_PROHIBIDOS.test(nombre)) {
    error = 'El nombre no puede contener \\ / : * ? " < > |';
  } else if (nombre === '.' || nombre === '..') {
    error = 'El nombre no es válido';
  }
  if (error) {
    throw new DatosInvalidos({ [campo]: error });
  }
  return nombre;
}

// "Viaje/Día 1/foto.jpg" -> ['Viaje', 'Día 1', 'foto.jpg']
export function dividirRuta(valor, campo = 'ruta') {
  const ruta = typeof valor === 'string' ? valor.replaceAll('\\', '/') : '';
  const segmentos = ruta.split('/').filter((segmento) => segmento.trim().length > 0);
  if (segmentos.length === 0) {
    throw new DatosInvalidos({ [campo]: 'La ruta es obligatoria' });
  }
  return segmentos.map((segmento) => validarNombre(segmento, campo));
}

function separarExtension(nombre) {
  const punto = nombre.lastIndexOf('.');
  return punto > 0 ? [nombre.slice(0, punto), nombre.slice(punto)] : [nombre, ''];
}

// "foto.jpg" -> "foto (2).jpg", "Fotos" -> "Fotos (2)"
export function sugerirNombre(nombre, tipo, ocupados) {
  const [base, extension] = tipo === 'ARCHIVO' ? separarExtension(nombre) : [nombre, ''];
  for (let numero = 2; ; numero++) {
    const candidato = `${base} (${numero})${extension}`;
    if (!ocupados.has(candidato.toLowerCase())) {
      return candidato;
    }
  }
}

// "informe.txt", 2 -> "informe (versión 2).txt"
export function nombreDeVersion(nombre, numero) {
  const [base, extension] = separarExtension(nombre);
  return `${base} (versión ${numero})${extension}`;
}
