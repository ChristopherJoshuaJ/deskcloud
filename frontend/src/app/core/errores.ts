import { HttpErrorResponse } from '@angular/common/http';
import { ErrorApi } from './modelos';

// Convierte cualquier error de una petición en { estado, codigo, mensaje, detalles }.
export function aErrorApi(error: unknown): ErrorApi {
  if (error instanceof HttpErrorResponse) {
    const cuerpo = error.error;
    if (cuerpo && typeof cuerpo === 'object' && 'codigo' in cuerpo) {
      return { estado: error.status, ...cuerpo };
    }
    if (error.status === 0) {
      return { estado: 0, codigo: 'SIN_CONEXION', mensaje: 'No se pudo conectar con el servidor' };
    }
    return { estado: error.status, codigo: 'ERROR', mensaje: `El servidor respondió ${error.status}` };
  }
  return { estado: 0, codigo: 'ERROR', mensaje: error instanceof Error ? error.message : 'Ocurrió un error inesperado' };
}

export function esCodigo(error: unknown, codigo: string): boolean {
  return aErrorApi(error).codigo === codigo;
}

// Mensaje para mostrar: si hay detalles por campo, se usan los mensajes de esos campos.
export function mensajeDe(error: unknown): string {
  const api = aErrorApi(error);
  if (api.codigo === 'DATOS_INVALIDOS' && api.detalles) {
    return Object.values(api.detalles).join('. ');
  }
  return api.mensaje;
}
