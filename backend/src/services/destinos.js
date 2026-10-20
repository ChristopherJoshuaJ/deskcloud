import { DatosInvalidos, NombreEnUso } from '../errores.js';
import { NOMBRE_RAIZ_VISIBLE, sugerirNombre } from './nombres.js';
import { esTextoEditable, tipoVista } from './tiposMime.js';

export const POLITICAS_CONFLICTO = ['preguntar', 'reemplazar', 'conservar', 'omitir'];

export function leerPoliticaConflicto(valor) {
  const politica = valor ?? 'preguntar';
  if (!POLITICAS_CONFLICTO.includes(politica)) {
    throw new DatosInvalidos({ conflicto: `Debe ser uno de: ${POLITICAS_CONFLICTO.join(', ')}` });
  }
  return politica;
}

export function leerIds(valor) {
  if (!Array.isArray(valor) || valor.length === 0) {
    throw new DatosInvalidos({ ids: 'Selecciona al menos un elemento' });
  }
  const ids = [...new Set(valor.map(Number))];
  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new DatosInvalidos({ ids: 'Hay identificadores inválidos' });
  }
  return ids;
}

// La raíz de Mi espacio se llama "ROOT" por dentro; la de un espacio compartido lleva el nombre del espacio.
export function nombreVisible(fila) {
  return fila.esRaiz === 1 && fila.tipoEspacio === 'PERSONAL' ? NOMBRE_RAIZ_VISIBLE : fila.nombre;
}

// cambios: ids con algo sin ver (ver seguimientoService.cambiosDe); sin él, sinVer es false.
export function aElemento(fila, cambios = null) {
  if (!fila) return null;
  const esCarpeta = fila.tipo === 'CARPETA';
  return {
    id: fila.id,
    espacioId: fila.espacioId,
    nombre: nombreVisible(fila),
    tipo: fila.tipo,
    padreId: fila.padreId,
    esRaiz: fila.esRaiz === 1,
    tamano: esCarpeta ? null : fila.tamano,
    elementos: esCarpeta ? fila.elementos : null,
    mime: esCarpeta ? null : fila.mime,
    tipoVista: esCarpeta ? null : tipoVista(fila.mime),
    esTextoEditable: !esCarpeta && esTextoEditable(fila.mime, fila.tamano),
    version: esCarpeta ? null : fila.version,
    esFavorito: fila.esFavorito === 1,
    color: fila.colorPersonal ?? fila.colorGrupo ?? null,
    colorEsPersonal: fila.colorPersonal != null,
    notaColor:
      fila.notaColor == null
        ? null
        : {
            texto: fila.notaColor,
            autor: fila.notaColorPorId == null ? null : { id: fila.notaColorPorId, nombre: fila.notaColorPorNombre },
            creadaEn: fila.notaColorEn,
          },
    propuestaPendiente: fila.propuestaId == null ? null : { id: fila.propuestaId, tipo: fila.propuestaTipo },
    sinVer: cambios?.has(fila.id) ?? false,
    creadoEn: fila.creadoEn,
    modificadoEn: fila.modificadoEn,
  };
}

export function aRuta(cadena) {
  return cadena.map((nodo) => ({
    id: nodo.id,
    nombre: nombreVisible(nodo),
    esRaiz: nodo.esRaiz === 1,
  }));
}

export function crearDestinos(nodos) {
  function ocupadosEn(padreId) {
    const ocupados = new Map();
    for (const hijo of nodos.nombresHijos(padreId)) {
      ocupados.set(hijo.nombre.toLowerCase(), hijo);
    }
    return ocupados;
  }

  // Recorre la ruta de carpetas desde padreId creando las que falten, como "mkdir -p".
  // Las carpetas que ya existen se reutilizan. Debe ejecutarse dentro de una transacción.
  function asegurarCarpetas(padreId, segmentos, { espacioId, creadoPor }) {
    let actual = padreId;
    for (const nombre of segmentos) {
      const existente = nodos.hijoPorNombre(actual, nombre);
      if (existente && existente.tipo !== 'CARPETA') {
        throw new NombreEnUso(
          [{ nombre, existenteId: existente.id, tipoExistente: existente.tipo, nombreSugerido: null }],
          `Ya existe un archivo llamado "${nombre}" donde debería ir una carpeta`,
        );
      }
      actual = existente ? existente.id : nodos.crear({ espacioId, padreId: actual, tipo: 'CARPETA', nombre, creadoPor });
    }
    return actual;
  }

  function conflictoCon(nombre, existente, ocupados, tipoNuevo) {
    return {
      nombre,
      existenteId: existente.id,
      tipoExistente: existente.tipo,
      nombreSugerido: sugerirNombre(nombre, tipoNuevo, ocupados),
    };
  }

  // Decide qué pasa con cada elemento que llega a la carpeta destino.
  // Devuelve [{ nodo, nombre, omitir?, reemplazar? }] o lanza NombreEnUso si la política es "preguntar".
  function planificar(destinoId, elementos, politica) {
    const ocupados = ocupadosEn(destinoId);
    const conflictos = [];
    const plan = [];

    for (const nodo of elementos) {
      const clave = nodo.nombre.toLowerCase();
      const existente = ocupados.get(clave);
      if (!existente) {
        plan.push({ nodo, nombre: nodo.nombre });
        ocupados.set(clave, nodo);
        continue;
      }

      const conflicto = conflictoCon(nodo.nombre, existente, ocupados, nodo.tipo);
      if (politica === 'preguntar') {
        conflictos.push(conflicto);
      } else if (politica === 'omitir') {
        plan.push({ nodo, omitir: true });
      } else if (politica === 'conservar') {
        plan.push({ nodo, nombre: conflicto.nombreSugerido });
        ocupados.set(conflicto.nombreSugerido.toLowerCase(), nodo);
      } else if (nodo.tipo === 'ARCHIVO' && existente.tipo === 'ARCHIVO' && existente.id !== nodo.id) {
        plan.push({ nodo, nombre: nodo.nombre, reemplazar: existente });
        ocupados.set(clave, nodo);
      } else {
        throw new NombreEnUso([conflicto], `Solo se puede reemplazar un archivo por otro archivo ("${nodo.nombre}")`);
      }
    }

    if (conflictos.length > 0) {
      throw new NombreEnUso(conflictos, 'Algunos elementos ya existen en el destino');
    }
    return plan;
  }

  function conflictoDeNombre(padreId, nombre, tipoNuevo, excluirId = null) {
    const existente = nodos.hijoPorNombre(padreId, nombre);
    if (!existente || existente.id === excluirId) {
      return null;
    }
    return { existente, conflicto: conflictoCon(nombre, existente, ocupadosEn(padreId), tipoNuevo) };
  }

  return { asegurarCarpetas, planificar, conflictoDeNombre, ocupadosEn };
}
