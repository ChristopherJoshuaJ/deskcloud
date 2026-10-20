// Tipos que reflejan las respuestas de la API del backend (ver README).

export interface Usuario {
  id: number;
  nombre: string;
  correo: string;
  espacioId: number;
  raizId: number;
  creadoEn: string;
}

export type TipoNodo = 'CARPETA' | 'ARCHIVO';
export type TipoVista = 'imagen' | 'pdf' | 'audio' | 'video' | 'texto' | null;
export type TipoPropuesta = 'ELIMINAR' | 'RESTAURAR' | 'ELIMINAR_DEFINITIVO';

export interface Persona {
  id: number;
  nombre: string;
}

export interface NotaColor {
  texto: string;
  autor: Persona | null;
  creadaEn: string;
}

export interface Elemento {
  id: number;
  espacioId: number;
  nombre: string;
  tipo: TipoNodo;
  padreId: number | null;
  esRaiz: boolean;
  tamano: number | null;
  elementos: number | null;
  mime: string | null;
  tipoVista: TipoVista;
  esTextoEditable: boolean;
  version: number | null;
  esFavorito: boolean;
  color: string | null;
  colorEsPersonal: boolean;
  notaColor: NotaColor | null;
  propuestaPendiente: { id: number; tipo: TipoPropuesta } | null;
  sinVer: boolean;
  creadoEn: string;
  modificadoEn: string;
  tieneSubcarpetas?: boolean;
  ubicacion?: string | null;
}

export interface ParteRuta {
  id: number;
  nombre: string;
  esRaiz: boolean;
}

export interface Contenido {
  carpeta: Elemento;
  ruta: ParteRuta[];
  elementos: Elemento[];
}

export interface Detalles {
  elemento: Elemento;
  ruta: ParteRuta[];
  resumen: { carpetas: number; archivos: number; tamanoTotal: number } | null;
}

export type PoliticaConflicto = 'preguntar' | 'reemplazar' | 'conservar' | 'omitir';

export interface ConflictoNombre {
  nombre: string;
  ruta?: string;
  existenteId: number;
  tipoExistente: TipoNodo;
  nombreSugerido: string | null;
}

export interface ElementoPapelera extends Elemento {
  eliminadoEn: string;
  ubicacionOriginal: ParteRuta[] | null;
  seEliminaEn: string | null;
  diasRestantes: number | null;
}

export interface Version {
  id: number;
  numero: number;
  tamano: number;
  mime: string | null;
  tipoVista: TipoVista;
  sha256: string;
  autor: Persona | null;
  restauradaDe: number | null;
  esActual: boolean;
  creadoEn: string;
}

export interface ResumenVersion {
  id: number;
  numero: number;
  sha256: string;
}

export interface EspacioResumen {
  id: number;
  nombre: string;
  raizId: number;
  administrador: Persona | null;
  esAdministrador: boolean;
  totalMiembros: number;
  sinVer: boolean;
  votosPendientes: number;
  creadoEn: string;
}

export interface Espacios {
  personal: { id: number; raizId: number; nombre: string };
  compartidos: EspacioResumen[];
}

export interface Miembro {
  id: number;
  nombre: string;
  correo: string;
  unidoEn: string;
  esAdministrador: boolean;
}

export interface InvitacionEnviada {
  id: number;
  invitado: Persona & { correo: string };
  invitadoPor: Persona | null;
  creadoEn: string;
}

export interface DetallesEspacio {
  espacio: EspacioResumen;
  miembros: Miembro[];
  invitaciones: InvitacionEnviada[];
}

export interface InvitacionRecibida {
  id: number;
  espacio: { id: number; nombre: string; totalMiembros: number };
  invitadoPor: Persona | null;
  creadoEn: string;
}

export interface Actividad {
  id: number;
  accion: string;
  usuario: Persona | null;
  nodoId: number | null;
  nombre: string | null;
  detalles: Record<string, unknown> | null;
  creadoEn: string;
}

export type EstadoPropuesta = 'ABIERTA' | 'APROBADA' | 'VENCIDA' | 'RETIRADA' | 'ANULADA';

export interface Propuesta {
  id: number;
  espacioId: number;
  tipo: TipoPropuesta;
  estado: EstadoPropuesta;
  motivo: string | null;
  propuestoPor: Persona | null;
  elementos: { id: number | null; nombre: string; tipo: TipoNodo }[];
  votos: { usuario: Persona; voto: 'SI' | 'NO' | null; votadoEn: string | null }[];
  recuento: { si: number; no: number; pendientes: number; total: number };
  miVoto: 'SI' | 'NO' | null;
  puedoVotar: boolean;
  creadaEn: string;
  expiraEn: string;
  cerradaEn: string | null;
}

export interface Aviso {
  id: number;
  tipo: string;
  espacioId: number | null;
  datos: Record<string, any>;
  leido: boolean;
  creadoEn: string;
}

export interface ResumenAvisos {
  noLeidos: number;
  invitaciones: number;
  votosPendientes: number;
}

export interface Sesion {
  id: string;
  navegador: string | null;
  creadaEn: string | null;
  ultimoUso: string | null;
  actual: boolean;
}

export interface UsoEspacio {
  id: number;
  nombre: string;
  total: number;
  archivos: number;
  versionesAnteriores: number;
  papelera: number;
  cantidadArchivos: number;
}

export interface ColorPredeterminado {
  nombre: string;
  valor: string;
}

export interface ErrorApi {
  estado: number;
  codigo: string;
  mensaje: string;
  detalles?: Record<string, any>;
}
