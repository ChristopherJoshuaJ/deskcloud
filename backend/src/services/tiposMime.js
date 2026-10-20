const POR_EXTENSION = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  m4a: 'audio/mp4',
  flac: 'audio/flac',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mkv: 'video/x-matroska',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  xml: 'application/xml',
  html: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  zip: 'application/zip',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

const GENERICO = 'application/octet-stream';

const IMAGENES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/bmp', 'image/svg+xml']);
const TEXTOS_NO_TEXT = new Set(['application/json', 'application/xml']);

// 'imagen' | 'pdf' | 'audio' | 'video' | 'texto' | null
export function tipoVista(mime) {
  if (!mime) return null;
  if (IMAGENES.has(mime)) return 'imagen';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('text/') || TEXTOS_NO_TEXT.has(mime)) return 'texto';
  return null;
}

// Por encima de este tamaño un editor en el navegador se vuelve lento; el archivo se puede
// seguir viendo y descargando, solo no se edita en línea.
export const LIMITE_TEXTO_EDITABLE = 5 * 1024 * 1024;

export function esTextoEditable(mime, tamano) {
  return tipoVista(mime) === 'texto' && tamano <= LIMITE_TEXTO_EDITABLE;
}

// Los textos (incluidos HTML, JS o XML) se sirven como texto plano para que el navegador
// los muestre y nunca los ejecute dentro del sitio.
export function tipoContenidoVista(mime) {
  return tipoVista(mime) === 'texto' ? 'text/plain; charset=utf-8' : mime;
}

export function determinarMime(cabeceraContentType, nombreArchivo) {
  const declarado = cabeceraContentType?.split(';')[0].trim().toLowerCase();
  if (declarado && declarado !== GENERICO) {
    return declarado;
  }
  const punto = nombreArchivo.lastIndexOf('.');
  const extension = punto > 0 ? nombreArchivo.slice(punto + 1).toLowerCase() : '';
  return POR_EXTENSION[extension] ?? GENERICO;
}
