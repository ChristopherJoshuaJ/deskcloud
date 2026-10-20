import { Pipe, PipeTransform } from '@angular/core';
import { Elemento } from './modelos';

const UNIDADES = ['B', 'KB', 'MB', 'GB', 'TB'];
const numero = new Intl.NumberFormat('es', { maximumFractionDigits: 1 });
const fechaCorta = new Intl.DateTimeFormat('es', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fechaLarga = new Intl.DateTimeFormat('es', { dateStyle: 'long', timeStyle: 'short' });
const relativa = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

// Debe coincidir con los @media (max-width: 720px) de los estilos.
export const PANTALLA_ESTRECHA = '(max-width: 720px)';

export function formatearTamano(bytes: number | null | undefined): string {
  if (bytes == null) return '';
  let valor = bytes;
  let unidad = 0;
  while (valor >= 1024 && unidad < UNIDADES.length - 1) {
    valor /= 1024;
    unidad++;
  }
  return `${unidad === 0 ? valor : numero.format(valor)} ${UNIDADES[unidad]}`;
}

export function formatearFecha(iso: string | null | undefined, larga = false): string {
  if (!iso) return '';
  return (larga ? fechaLarga : fechaCorta).format(new Date(iso));
}

export function formatearRelativa(iso: string | null | undefined): string {
  if (!iso) return '';
  const segundos = (new Date(iso).getTime() - Date.now()) / 1000;
  const pasos: [Intl.RelativeTimeFormatUnit, number][] = [
    ['second', 60],
    ['minute', 60],
    ['hour', 24],
    ['day', 30],
    ['month', 12],
    ['year', Infinity],
  ];
  let valor = segundos;
  for (const [unidad, limite] of pasos) {
    if (Math.abs(valor) < limite) return relativa.format(Math.round(valor), unidad);
    valor /= limite;
  }
  return formatearFecha(iso);
}

export function extension(nombre: string): string {
  const punto = nombre.lastIndexOf('.');
  return punto > 0 ? nombre.slice(punto + 1).toLowerCase() : '';
}

// Ícono de PrimeIcons y una etiqueta corta del tipo, al estilo de la columna "Tipo" del explorador.
export function iconoDe(elemento: Pick<Elemento, 'tipo' | 'nombre' | 'mime' | 'tipoVista' | 'esRaiz'>): string {
  if (elemento.tipo === 'CARPETA') return elemento.esRaiz ? 'pi pi-home' : 'pi pi-folder';
  const ext = extension(elemento.nombre);
  if (elemento.tipoVista === 'imagen') return 'pi pi-image';
  if (elemento.tipoVista === 'video') return 'pi pi-video';
  if (elemento.tipoVista === 'audio') return 'pi pi-volume-up';
  if (elemento.tipoVista === 'pdf') return 'pi pi-file-pdf';
  if (['xls', 'xlsx', 'csv', 'ods'].includes(ext)) return 'pi pi-file-excel';
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) return 'pi pi-file-word';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'pi pi-box';
  if (['js', 'ts', 'json', 'html', 'css', 'scss', 'java', 'py', 'c', 'cpp', 'cs', 'xml', 'sql'].includes(ext)) return 'pi pi-code';
  if (elemento.tipoVista === 'texto') return 'pi pi-file-edit';
  return 'pi pi-file';
}

export function tipoLegible(elemento: Pick<Elemento, 'tipo' | 'nombre' | 'tipoVista'>): string {
  if (elemento.tipo === 'CARPETA') return 'Carpeta';
  const ext = extension(elemento.nombre);
  const porVista: Record<string, string> = {
    imagen: 'Imagen',
    video: 'Video',
    audio: 'Audio',
    pdf: 'Documento PDF',
    texto: 'Texto',
  };
  const base = elemento.tipoVista ? porVista[elemento.tipoVista] : 'Archivo';
  return ext && elemento.tipoVista !== 'pdf' ? `${base} ${ext.toUpperCase()}` : base;
}

@Pipe({ name: 'tamano' })
export class TamanoPipe implements PipeTransform {
  transform(bytes: number | null | undefined) {
    return formatearTamano(bytes);
  }
}

@Pipe({ name: 'fecha' })
export class FechaPipe implements PipeTransform {
  transform(iso: string | null | undefined, larga = false) {
    return formatearFecha(iso, larga);
  }
}

@Pipe({ name: 'relativa' })
export class RelativaPipe implements PipeTransform {
  transform(iso: string | null | undefined) {
    return formatearRelativa(iso);
  }
}
