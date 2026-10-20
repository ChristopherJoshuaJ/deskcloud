import { createHash } from 'node:crypto';
import {
  ContenidoDemasiadoGrande,
  NoEditable,
  PrecondicionRequerida,
  TipoNoSoportado,
  VersionDesactualizada,
} from '../errores.js';
import { enTransaccion } from '../db/index.js';
import { crearNodosRepository } from '../repositories/nodosRepository.js';
import { aElemento } from './destinos.js';
import { LIMITE_TEXTO_EDITABLE, tipoVista } from './tiposMime.js';

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const MEGABYTES_LIMITE = LIMITE_TEXTO_EDITABLE / (1024 * 1024);

// Edición de documentos de texto: se lee el texto completo y cada guardado crea una versión nueva.
// Para no pisar cambios ajenos, el guardado indica en If-Match la versión (sha256) que se editó.
export function crearTextoService(db, { autorizacion, almacenamiento, seguimiento }) {
  const nodos = crearNodosRepository(db);

  function versionEditable(nodo) {
    const version = almacenamiento.obtenerVersionActual(nodo.id);
    if (tipoVista(version.mime) !== 'texto') {
      throw new NoEditable('Solo se pueden editar documentos de texto');
    }
    if (version.tamano > LIMITE_TEXTO_EDITABLE) {
      throw new NoEditable(`El documento supera los ${MEGABYTES_LIMITE} MB y no se puede editar en línea`);
    }
    return version;
  }

  function leer(usuario, nodoId) {
    const { nodo } = autorizacion.exigirArchivo(usuario, nodoId);
    const version = versionEditable(nodo);
    const texto = decodificar(almacenamiento.leerCompleto(version.id));
    seguimiento.marcarVisto(usuario, nodo);
    return { texto, version: resumen(version) };
  }

  async function guardar(usuario, nodoId, { tipoContenido, siCoincide, contenido }) {
    const { nodo, espacio } = autorizacion.exigirArchivo(usuario, nodoId);
    if (!esTextoPlano(tipoContenido)) {
      throw new TipoNoSoportado('El texto debe enviarse como text/plain; charset=utf-8');
    }
    const actual = versionEditable(nodo);
    const esperadas = leerEtiquetas(siCoincide);
    if (!esperadas) {
      throw new PrecondicionRequerida('Indica en If-Match la versión del documento que editaste');
    }
    if (!esperadas.includes('*') && !esperadas.includes(actual.sha256)) {
      throw new VersionDesactualizada(resumen(actual));
    }

    let datos = await leerCuerpo(contenido);
    decodificar(datos);
    if (!empiezaConBom(datos) && tieneBom(actual)) {
      datos = Buffer.concat([BOM, datos]);
    }

    if (createHash('sha256').update(datos).digest('hex') === actual.sha256) {
      return { accion: 'sin-cambios', version: resumen(actual), elemento: elementoDe(nodo, usuario) };
    }
    const nueva = await almacenamiento.guardarContenido({
      nodoId: nodo.id,
      contenido: datos,
      mime: actual.mime,
      usuarioId: usuario.id,
      versionBaseId: actual.id,
    });
    enTransaccion(db, () =>
      seguimiento.registrar(espacio, usuario, {
        accion: 'EDITAR_TEXTO',
        nodo,
        detalles: { version: nueva.numero },
        cambiados: [nodo.id],
      }),
    );
    return { accion: 'guardado', version: resumen(nueva), elemento: elementoDe(nodo, usuario) };
  }

  // Editores como el Bloc de notas marcan el UTF-8 con un BOM; se conserva para no cambiar el archivo
  // más allá de lo que se editó.
  function tieneBom(version) {
    return version.tamano >= BOM.length && empiezaConBom(almacenamiento.leer(version.id, { inicio: 0, fin: BOM.length - 1 }));
  }

  function elementoDe(nodo, usuario) {
    return aElemento(nodos.obtenerElemento(nodo.id, usuario.id));
  }

  return { leer, guardar };
}

function resumen(version) {
  return { id: version.id, numero: version.numero, sha256: version.sha256 };
}

// Un archivo que no es UTF-8 válido se rechaza en vez de mostrarlo con caracteres rotos:
// guardarlo después de editarlo dañaría el contenido original.
function decodificar(datos) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(datos);
  } catch {
    throw new NoEditable('El documento no está en UTF-8 y no se puede editar en línea');
  }
}

function empiezaConBom(datos) {
  return datos.length >= BOM.length && datos.subarray(0, BOM.length).equals(BOM);
}

function esTextoPlano(tipoContenido) {
  const [tipo, ...parametros] = (tipoContenido ?? '').split(';').map((parte) => parte.trim().toLowerCase());
  const charset = parametros.find((p) => p.startsWith('charset='))?.slice('charset='.length).replaceAll('"', '');
  return tipo === 'text/plain' && (charset === undefined || charset === 'utf-8');
}

// If-Match: "abc", W/"def" -> ['abc', 'def']; If-Match: * fuerza el guardado.
function leerEtiquetas(cabecera) {
  if (!cabecera?.trim()) return null;
  return cabecera.split(',').map((etiqueta) => etiqueta.trim().replace(/^W\//, '').replaceAll('"', ''));
}

async function leerCuerpo(contenido) {
  if (typeof contenido === 'string' || contenido instanceof Uint8Array) {
    contenido = [Buffer.from(contenido)];
  }
  const partes = [];
  let total = 0;
  for await (const parte of contenido) {
    total += parte.length;
    if (total > LIMITE_TEXTO_EDITABLE) {
      throw new ContenidoDemasiadoGrande(`El documento no puede superar los ${MEGABYTES_LIMITE} MB`);
    }
    partes.push(parte);
  }
  return Buffer.concat(partes, total);
}
