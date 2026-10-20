import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { contentDisposition } from './enviarVersion.js';

export async function enviarZip(req, res, { nombre, longitud, partes }) {
  res.set({
    'Content-Type': 'application/zip',
    'Content-Disposition': contentDisposition('attachment', nombre),
    'Content-Length': String(longitud),
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  try {
    await pipeline(Readable.from(partes), res);
  } catch (error) {
    if (error.code !== 'ERR_STREAM_PREMATURE_CLOSE') throw error;
  }
}
