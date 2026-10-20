import { enTransaccion } from '../db/index.js';
import { DatosInvalidos, NombreEnUso } from '../errores.js';
import { crearNodosRepository } from '../repositories/nodosRepository.js';
import { aElemento, crearDestinos, leerPoliticaConflicto } from './destinos.js';
import { dividirRuta } from './nombres.js';
import { determinarMime } from './tiposMime.js';

const MAXIMO_RUTAS_A_VERIFICAR = 10000;

export function crearSubidasService(db, { autorizacion, almacenamiento, seguimiento }) {
  const nodos = crearNodosRepository(db);
  const destinos = crearDestinos(nodos);

  // ruta puede ser solo el nombre ("foto.jpg") o incluir carpetas ("Viaje/Día 1/foto.jpg")
  // cuando se sube una carpeta completa; las carpetas que falten se crean.
  async function subirArchivo(usuario, carpetaId, { ruta, conflicto, tipoContenido, contenido }) {
    const { nodo: carpeta, espacio } = autorizacion.exigirCarpeta(usuario, carpetaId);
    const segmentos = dividirRuta(ruta);
    const nombre = segmentos.pop();
    const politica = leerPoliticaConflicto(conflicto);
    const origen = { espacioId: carpeta.espacioId, creadoPor: usuario.id };

    const plan = enTransaccion(db, () => {
      const destinoId = destinos.asegurarCarpetas(carpeta.id, segmentos, origen);
      const crear = (nombreFinal) => ({
        accion: 'creado',
        destinoId,
        nombre: nombreFinal,
        nodoId: nodos.crear({ ...origen, padreId: destinoId, tipo: 'ARCHIVO', nombre: nombreFinal }),
      });

      const choque = destinos.conflictoDeNombre(destinoId, nombre, 'ARCHIVO');
      if (!choque) return crear(nombre);

      switch (politica) {
        case 'omitir':
          return { accion: 'omitido', nodoId: choque.existente.id };
        case 'conservar':
          return crear(choque.conflicto.nombreSugerido);
        case 'reemplazar':
          if (choque.existente.tipo !== 'ARCHIVO') {
            throw new NombreEnUso([choque.conflicto], `Ya existe una carpeta llamada "${nombre}"`);
          }
          return { accion: 'reemplazado', destinoId, nombre: choque.existente.nombre, nodoId: choque.existente.id };
        default:
          throw new NombreEnUso([choque.conflicto]);
      }
    });

    if (plan.accion !== 'omitido') {
      try {
        await almacenamiento.guardarContenido({
          nodoId: plan.nodoId,
          contenido,
          mime: determinarMime(tipoContenido, nombre),
          usuarioId: usuario.id,
        });
      } catch (error) {
        if (plan.accion === 'creado') {
          nodos.eliminar(plan.nodoId);
        }
        throw error;
      }
      enTransaccion(db, () =>
        seguimiento.registrar(espacio, usuario, {
          accion: plan.accion === 'creado' ? 'SUBIR' : 'NUEVA_VERSION',
          nodo: { id: plan.nodoId, nombre: plan.nombre },
          detalles: segmentos.length > 0 ? { ruta: [...segmentos, plan.nombre].join('/') } : {},
          cambiados: [plan.nodoId, plan.destinoId],
        }),
      );
    }
    return { accion: plan.accion, elemento: aElemento(nodos.obtenerElemento(plan.nodoId, usuario.id)) };
  }

  // Permite al frontend preguntar antes de enviar los bytes qué archivos ya existen.
  function verificarNombres(usuario, carpetaId, datos = {}) {
    const { nodo: carpeta } = autorizacion.exigirCarpeta(usuario, carpetaId);
    const { rutas } = datos;
    if (!Array.isArray(rutas) || rutas.length === 0 || rutas.length > MAXIMO_RUTAS_A_VERIFICAR) {
      throw new DatosInvalidos({ rutas: `Envía entre 1 y ${MAXIMO_RUTAS_A_VERIFICAR} rutas` });
    }

    const conflictos = [];
    for (const ruta of rutas) {
      const segmentos = dividirRuta(ruta, 'rutas');
      const nombre = segmentos.pop();
      let actual = carpeta.id;
      let bloqueado = false;
      for (const segmento of segmentos) {
        const existente = nodos.hijoPorNombre(actual, segmento);
        if (!existente) {
          actual = null;
          break;
        }
        if (existente.tipo !== 'CARPETA') {
          conflictos.push({ ruta, nombre: segmento, existenteId: existente.id, tipoExistente: existente.tipo, nombreSugerido: null });
          bloqueado = true;
          break;
        }
        actual = existente.id;
      }
      if (actual === null || bloqueado) continue;

      const choque = destinos.conflictoDeNombre(actual, nombre, 'ARCHIVO');
      if (choque) {
        conflictos.push({ ruta, ...choque.conflicto });
      }
    }
    return { conflictos };
  }

  return { subirArchivo, verificarNombres };
}
