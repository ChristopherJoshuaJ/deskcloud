import { ErrorAplicacion } from '../errores.js';

export function rutaApiNoEncontrada(req, res) {
  res.status(404).json({ codigo: 'RUTA_NO_ENCONTRADA', mensaje: `No existe ${req.method} ${req.originalUrl}` });
}

export function manejarErrores(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }
  if (error instanceof ErrorAplicacion) {
    return res.status(error.estado).json({ codigo: error.codigo, mensaje: error.message, detalles: error.detalles });
  }
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({ codigo: 'JSON_INVALIDO', mensaje: 'El cuerpo de la petición no es JSON válido' });
  }
  if (error.type === 'entity.too.large') {
    return res.status(413).json({ codigo: 'CONTENIDO_DEMASIADO_GRANDE', mensaje: 'El cuerpo de la petición es demasiado grande' });
  }
  console.error(error);
  res.status(500).json({ codigo: 'ERROR_INTERNO', mensaje: 'Ocurrió un error inesperado' });
}
