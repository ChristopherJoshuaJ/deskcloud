import { Actividad, Aviso, TipoPropuesta } from './modelos';

export const NOMBRE_PROPUESTA: Record<TipoPropuesta, string> = {
  ELIMINAR: 'Enviar a la papelera',
  RESTAURAR: 'Restaurar',
  ELIMINAR_DEFINITIVO: 'Eliminar definitivamente',
};

export const VERBO_PROPUESTA: Record<TipoPropuesta, string> = {
  ELIMINAR: 'enviar a la papelera',
  RESTAURAR: 'restaurar',
  ELIMINAR_DEFINITIVO: 'eliminar definitivamente',
};

const comillas = (texto: unknown) => (texto ? `"${texto}"` : '');

// Lo votado pudo cambiar mientras tanto (por ejemplo, se restauró antes de eliminarlo definitivamente).
const sinEfecto = (d: Record<string, unknown>) => (d['ejecutados'] === 0 ? ', pero ya no quedaba nada que hacer' : '');

// Algunos registros los produce el sistema (o el último voto), así que no se escriben como "Ana hizo…".
const SIN_AUTOR = new Set(['NUEVO_ADMINISTRADOR', 'PROPUESTA_APROBADA', 'PROPUESTA_VENCIDA', 'PROPUESTA_ANULADA']);

export function lineaActividad(a: Actividad): { quien: string | null; texto: string } {
  const texto = textoActividad(a);
  if (SIN_AUTOR.has(a.accion) || !a.usuario) {
    return { quien: null, texto: texto.charAt(0).toUpperCase() + texto.slice(1) };
  }
  return { quien: a.usuario.nombre, texto };
}

// Frase para el historial de actividad de un espacio compartido, sin el nombre de quien la hizo.
function textoActividad(a: Actividad): string {
  const d = a.detalles ?? {};
  const nombre = comillas(a.nombre);
  const tipo = d['tipo'] as TipoPropuesta | undefined;
  switch (a.accion) {
    case 'CREAR_ESPACIO':
      return `creó el espacio ${nombre}`;
    case 'RENOMBRAR_ESPACIO':
      return `cambió el nombre del espacio de ${comillas(d['nombreAnterior'])} a ${nombre}`;
    case 'INVITAR':
      return `invitó a ${a.nombre}`;
    case 'UNIRSE':
      return 'se unió al espacio';
    case 'SALIR':
      return 'salió del espacio';
    case 'EXPULSAR':
      return `sacó a ${a.nombre} del espacio`;
    case 'NUEVO_ADMINISTRADOR':
      return `${a.nombre} ahora es quien administra el espacio`;
    case 'CREAR_CARPETA':
      return `creó la carpeta ${nombre}`;
    case 'SUBIR':
      return `subió ${d['ruta'] ? comillas(d['ruta']) : nombre}`;
    case 'NUEVA_VERSION':
      return `subió una nueva versión de ${nombre}`;
    case 'EDITAR_TEXTO':
      return `editó ${nombre}`;
    case 'RENOMBRAR':
      return `cambió el nombre de ${comillas(d['nombreAnterior'])} a ${nombre}`;
    case 'MOVER':
      return `movió ${nombre} a ${d['destino'] ?? 'otra carpeta'}`;
    case 'COPIAR':
      return d['desdeOtroEspacio'] ? `trajo una copia de ${nombre} desde otro espacio` : `copió ${nombre}`;
    case 'RESTAURAR_VERSION':
      return `restauró la versión ${d['desde'] ?? ''} de ${nombre}`;
    case 'COLOR':
      return `puso color a ${nombre}`;
    case 'COLOR_PARA_TODOS':
      return `cambió el color de ${nombre} para todos: ${comillas(d['nota'])}`;
    case 'PROPONER':
      return `propuso ${tipo ? VERBO_PROPUESTA[tipo] : 'un cambio'} ${nombre}${d['motivo'] ? ` (${d['motivo']})` : ''}`;
    case 'VOTAR':
      return `votó ${d['voto'] === 'SI' ? 'a favor' : 'en contra'}`;
    case 'PROPUESTA_APROBADA':
      return `se aprobó ${tipo ? VERBO_PROPUESTA[tipo] : 'la propuesta sobre'} ${nombre}${sinEfecto(d)}`;
    case 'PROPUESTA_VENCIDA':
      return `venció la votación para ${tipo ? VERBO_PROPUESTA[tipo] : ''} ${nombre}`;
    case 'PROPUESTA_RETIRADA':
      return `retiró la propuesta sobre ${nombre}`;
    case 'PROPUESTA_ANULADA':
      return `se anuló la propuesta sobre ${nombre}`;
    default:
      return a.accion.toLowerCase().replaceAll('_', ' ');
  }
}

export interface TextoAviso {
  icono: string;
  titulo: string;
  detalle?: string;
}

export function textoAviso(aviso: Aviso): TextoAviso {
  const d = aviso.datos;
  const espacio = d['espacioNombre'] ? `en "${d['espacioNombre']}"` : '';
  const tipo = d['tipo'] as TipoPropuesta | undefined;
  const verbo = tipo ? VERBO_PROPUESTA[tipo] : '';
  switch (aviso.tipo) {
    case 'INVITACION':
      return { icono: 'pi pi-envelope', titulo: `${d['invitadoPor']} te invitó a "${d['espacioNombre']}"` };
    case 'VOTO_PENDIENTE':
      return {
        icono: 'pi pi-check-square',
        titulo: `${d['propuestoPor']} propone ${verbo} "${d['nombres']}" ${espacio}`,
        detalle: d['motivo'] ? `Motivo: ${d['motivo']}` : undefined,
      };
    case 'PROPUESTA_APROBADA':
      return { icono: 'pi pi-check-circle', titulo: `Se aprobó ${verbo} "${d['nombres']}" ${espacio}`, detalle: sinEfecto(d) ? 'Ya no quedaba nada que hacer.' : undefined };
    case 'PROPUESTA_VENCIDA':
      return { icono: 'pi pi-clock', titulo: `Venció sin unanimidad la votación para ${verbo} "${d['nombres']}" ${espacio}` };
    case 'PROPUESTA_RETIRADA':
      return { icono: 'pi pi-undo', titulo: `Se retiró la propuesta para ${verbo} "${d['nombres']}" ${espacio}` };
    case 'PROPUESTA_ANULADA':
      return { icono: 'pi pi-ban', titulo: `Se anuló la propuesta para ${verbo} "${d['nombres']}" ${espacio}` };
    case 'PROPUESTA_POR_VENCER':
      return { icono: 'pi pi-hourglass', titulo: `Vence en menos de un día la votación para ${verbo} "${d['nombres']}" ${espacio}` };
    case 'COLOR_PARA_TODOS':
      return { icono: 'pi pi-palette', titulo: `${d['autor']} marcó "${d['nombre']}" ${espacio}`, detalle: d['nota'] };
    case 'EXPULSADO':
      return { icono: 'pi pi-sign-out', titulo: `Ya no eres miembro de "${d['espacioNombre']}"` };
    case 'ADMINISTRADOR':
      return { icono: 'pi pi-crown', titulo: `Ahora administras "${d['espacioNombre']}"` };
    default:
      return { icono: 'pi pi-bell', titulo: aviso.tipo };
  }
}
