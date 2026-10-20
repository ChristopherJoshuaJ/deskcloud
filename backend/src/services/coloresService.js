import { enTransaccion } from '../db/index.js';
import { DatosInvalidos, ReglaNegocio } from '../errores.js';
import { crearColoresRepository } from '../repositories/coloresRepository.js';
import { crearNodosRepository } from '../repositories/nodosRepository.js';
import { esCompartido } from './autorizacionService.js';
import { aElemento } from './destinos.js';

// Pensados para el tema oscuro; también se acepta cualquier color en hexadecimal.
export const COLORES_PREDETERMINADOS = [
  { nombre: 'Azul', valor: '#4668a1' },
  { nombre: 'Celeste', valor: '#3fa7d6' },
  { nombre: 'Verde', valor: '#4caf7a' },
  { nombre: 'Amarillo', valor: '#e0b84c' },
  { nombre: 'Naranja', valor: '#e8893a' },
  { nombre: 'Rojo', valor: '#e05757' },
  { nombre: 'Violeta', valor: '#8e6bd1' },
  { nombre: 'Gris', valor: '#8a96a8' },
];

const PATRON_COLOR = /^#[0-9a-f]{6}$/i;
const LONGITUD_MAXIMA_NOTA = 300;

// En Mi espacio cada elemento tiene un solo color. En un espacio compartido hay un color del
// grupo y un color personal por miembro: el primer color que alguien elige se vuelve el del grupo
// y los siguientes son personales. "Para todos" exige una nota, cambia el color del grupo,
// borra los colores personales del elemento y avisa a los demás.
export function crearColoresService(db, { autorizacion, seguimiento }) {
  const nodos = crearNodosRepository(db);
  const colores = crearColoresRepository(db);

  function cambiar(usuario, nodoId, datos = {}) {
    const { nodo, espacio } = autorizacion.exigirAcceso(usuario, nodoId);
    if (nodo.esRaiz) {
      throw new ReglaNegocio('Solo se pueden colorear carpetas y archivos');
    }
    const color = leerColor(datos.color);
    const paraTodos = datos.paraTodos === true;

    if (!esCompartido(espacio)) {
      if (paraTodos) {
        throw new ReglaNegocio('Cambiar el color para todos solo existe en los espacios compartidos');
      }
      nodos.establecerColor(nodo.id, color);
    } else if (paraTodos) {
      const nota = leerNota(datos.nota);
      enTransaccion(db, () => {
        nodos.establecerColorGrupo(nodo.id, { color, nota, usuarioId: usuario.id });
        colores.quitarPersonalesDe(nodo.id);
        seguimiento.registrar(espacio, usuario, {
          accion: 'COLOR_PARA_TODOS',
          nodo,
          detalles: { color, nota },
          cambiados: [nodo.id],
        });
        seguimiento.avisarMiembros(espacio, usuario, 'COLOR_PARA_TODOS', {
          nodoId: nodo.id,
          nombre: nodo.nombre,
          color,
          nota,
          autor: usuario.nombre,
          espacioNombre: espacio.nombre,
        });
      });
    } else if (color === null) {
      colores.quitarPersonal(usuario.id, nodo.id);
    } else if (nodo.color === null) {
      enTransaccion(db, () => {
        nodos.establecerColor(nodo.id, color);
        seguimiento.registrar(espacio, usuario, { accion: 'COLOR', nodo, detalles: { color }, cambiados: [nodo.id] });
      });
    } else {
      colores.establecerPersonal(usuario.id, nodo.id, color);
    }
    return aElemento(nodos.obtenerElemento(nodo.id, usuario.id));
  }

  return { cambiar, predeterminados: () => COLORES_PREDETERMINADOS };
}

function leerColor(valor) {
  if (valor === null) return null;
  if (typeof valor !== 'string' || !PATRON_COLOR.test(valor.trim())) {
    throw new DatosInvalidos({ color: 'Debe ser un color en hexadecimal como #e05757, o null para quitarlo' });
  }
  return valor.trim().toLowerCase();
}

function leerNota(valor) {
  const nota = typeof valor === 'string' ? valor.trim() : '';
  if (nota.length === 0) {
    throw new DatosInvalidos({ nota: 'Para cambiar el color de todos hay que escribir una nota' });
  }
  if (nota.length > LONGITUD_MAXIMA_NOTA) {
    throw new DatosInvalidos({ nota: `La nota no puede superar los ${LONGITUD_MAXIMA_NOTA} caracteres` });
  }
  return nota;
}
