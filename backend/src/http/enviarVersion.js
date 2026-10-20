import { pipeline } from 'node:stream/promises';
import { RangoInvalido } from '../errores.js';

const NO_SATISFACIBLE = Symbol('rango no satisfacible');

// Envía el contenido de una versión admitiendo peticiones Range (para que audio y video
// se puedan adelantar y las descargas reanudar) y validación por ETag.
export async function enviarVersion(req, res, { almacenamiento, version, nombre, disposicion, tipoContenido, cabeceras = {} }) {
  res.set({
    'Content-Type': tipoContenido,
    'Content-Disposition': contentDisposition(disposicion, nombre),
    'Accept-Ranges': 'bytes',
    ETag: `"${version.sha256}"`,
    'Cache-Control': 'private, no-cache',
    'X-Content-Type-Options': 'nosniff',
    ...cabeceras,
  });

  if (req.fresh) {
    res.status(304).end();
    return;
  }

  const rango = leerRango(req.get('range'), version.tamano);
  if (rango === NO_SATISFACIBLE) {
    res.set('Content-Range', `bytes */${version.tamano}`);
    throw new RangoInvalido();
  }

  const lectura = almacenamiento.abrirLectura(version.id, rango ?? {});
  if (rango) {
    res.status(206).set('Content-Range', `bytes ${lectura.inicio}-${lectura.fin}/${version.tamano}`);
  }
  res.set('Content-Length', String(lectura.longitud));

  if (req.method === 'HEAD') {
    lectura.stream.destroy();
    res.end();
    return;
  }
  try {
    await pipeline(lectura.stream, res);
  } catch (error) {
    if (error.code !== 'ERR_STREAM_PREMATURE_CLOSE') throw error;
  }
}

// Solo se atiende un rango; con varios rangos o una cabecera mal formada se envía el archivo completo.
export function leerRango(cabecera, tamano) {
  const partes = /^bytes=(\d*)-(\d*)$/.exec(cabecera?.trim() ?? '');
  if (!partes || (partes[1] === '' && partes[2] === '')) {
    return null;
  }
  const [, desde, hasta] = partes;

  let inicio;
  let fin;
  if (desde === '') {
    const sufijo = Number(hasta);
    if (sufijo === 0) return NO_SATISFACIBLE;
    inicio = Math.max(tamano - sufijo, 0);
    fin = tamano - 1;
  } else {
    inicio = Number(desde);
    fin = hasta === '' ? tamano - 1 : Math.min(Number(hasta), tamano - 1);
  }
  if (inicio >= tamano || inicio > fin) {
    return NO_SATISFACIBLE;
  }
  return { inicio, fin };
}

export function contentDisposition(tipo, nombre) {
  const alternativo = nombre.replace(/[^\x20-\x7e]|["\\]/g, '_');
  const codificado = encodeURIComponent(nombre).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${tipo}; filename="${alternativo}"; filename*=UTF-8''${codificado}`;
}
