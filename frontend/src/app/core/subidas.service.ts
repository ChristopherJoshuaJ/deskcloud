import { HttpEventType } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Subscription } from 'rxjs';
import { AccionesService } from './acciones.service';
import { Api, ResultadoSubida } from './api.service';
import { SeleccionLocal } from './archivos-locales';
import { mensajeDe } from './errores';
import { EventosService } from './eventos.service';
import { ConflictoNombre, PoliticaConflicto } from './modelos';
import { Notificar } from './notificar.service';
import { SesionService } from './sesion.service';

const SUBIDAS_SIMULTANEAS = 3;
const MAXIMO_RUTAS_POR_CONSULTA = 10_000;

export type EstadoSubida = 'esperando' | 'subiendo' | 'listo' | 'omitido' | 'error' | 'cancelado';

export interface TareaSubida {
  id: number;
  nombre: string;
  ruta: string;
  tamano: number;
  carpetaId: number;
  enviado: number;
  estado: EstadoSubida;
  error?: string;
}

interface Trabajo {
  id: number;
  archivo: File;
  politica: PoliticaConflicto;
  suscripcion?: Subscription;
}

@Injectable({ providedIn: 'root' })
export class SubidasService {
  private readonly api = inject(Api);
  private readonly acciones = inject(AccionesService);
  private readonly eventos = inject(EventosService);
  private readonly notificar = inject(Notificar);
  private readonly sesion = inject(SesionService);

  readonly tareas = signal<TareaSubida[]>([]);
  readonly activas = computed(() => this.tareas().filter((t) => t.estado === 'esperando' || t.estado === 'subiendo'));
  readonly progreso = computed(() => {
    const tareas = this.tareas().filter((t) => t.estado !== 'cancelado' && t.estado !== 'omitido');
    const total = tareas.reduce((suma, t) => suma + t.tamano, 0);
    const enviado = tareas.reduce((suma, t) => suma + (t.estado === 'listo' ? t.tamano : t.enviado), 0);
    return total === 0 ? 100 : Math.round((enviado / total) * 100);
  });

  private siguienteId = 1;
  private readonly cola: Trabajo[] = [];
  private readonly enCurso = new Map<number, Trabajo>();
  private carpetasPorRefrescar = new Set<number>();
  private refresco: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Al cerrar sesión no deben quedar a la vista las subidas de la cuenta anterior.
    effect(() => {
      if (!this.sesion.conectado()) untracked(() => this.reiniciar());
    });
  }

  // Primero pregunta qué nombres ya existen, para decidir una sola vez qué hacer con los repetidos.
  async subir(carpetaId: number, espacioId: number, seleccion: SeleccionLocal): Promise<void> {
    const { archivos, carpetasVacias } = seleccion;
    if (archivos.length === 0 && carpetasVacias.length === 0) return;

    let conflictos: ConflictoNombre[] = [];
    try {
      for (let i = 0; i < archivos.length; i += MAXIMO_RUTAS_POR_CONSULTA) {
        const rutas = archivos.slice(i, i + MAXIMO_RUTAS_POR_CONSULTA).map((a) => a.ruta);
        conflictos.push(...(await this.api.verificarNombres(carpetaId, rutas)).conflictos);
      }
    } catch (error) {
      this.notificar.error(error, 'No se pudo preparar la subida');
      return;
    }

    let politica: PoliticaConflicto = 'preguntar';
    if (conflictos.length > 0) {
      const elegida = await this.acciones.preguntarConflictos(conflictos, 'subir', espacioId);
      if (!elegida) return;
      politica = elegida;
    }
    const conCarpeta = new Set(conflictos.filter((c) => c.tipoExistente === 'CARPETA').map((c) => c.ruta));

    for (const ruta of carpetasVacias) {
      try {
        await this.api.crearRuta(carpetaId, ruta);
      } catch (error) {
        this.notificar.error(error, `No se pudo crear la carpeta "${ruta}"`);
      }
    }
    if (carpetasVacias.length > 0) this.refrescar(carpetaId);

    const nuevas: TareaSubida[] = [];
    for (const { archivo, ruta } of archivos) {
      const id = this.siguienteId++;
      // Si el nombre lo ocupa una carpeta no hay archivo que reemplazar: se conservan ambos.
      const politicaArchivo = politica === 'reemplazar' && conCarpeta.has(ruta) ? 'conservar' : politica;
      nuevas.push({ id, nombre: archivo.name, ruta, tamano: archivo.size, carpetaId, enviado: 0, estado: 'esperando' });
      this.cola.push({ id, archivo, politica: politicaArchivo });
    }
    this.tareas.update((tareas) => [...tareas, ...nuevas]);
    this.continuar();
  }

  cancelar(id: number) {
    const indice = this.cola.findIndex((t) => t.id === id);
    if (indice >= 0) this.cola.splice(indice, 1);
    this.enCurso.get(id)?.suscripcion?.unsubscribe();
    this.enCurso.delete(id);
    this.actualizar(id, { estado: 'cancelado' });
    this.continuar();
  }

  cancelarTodo() {
    for (const tarea of this.activas()) this.cancelar(tarea.id);
  }

  limpiarTerminadas() {
    this.tareas.update((tareas) => tareas.filter((t) => t.estado === 'esperando' || t.estado === 'subiendo'));
  }

  private reiniciar() {
    this.cola.length = 0;
    for (const trabajo of this.enCurso.values()) trabajo.suscripcion?.unsubscribe();
    this.enCurso.clear();
    this.tareas.set([]);
  }

  private continuar() {
    while (this.enCurso.size < SUBIDAS_SIMULTANEAS && this.cola.length > 0) {
      const trabajo = this.cola.shift()!;
      this.enCurso.set(trabajo.id, trabajo);
      this.enviar(trabajo);
    }
  }

  private enviar(trabajo: Trabajo) {
    const tarea = this.tareas().find((t) => t.id === trabajo.id);
    if (!tarea) return;
    this.actualizar(trabajo.id, { estado: 'subiendo' });
    const terminar = (cambios: Partial<TareaSubida>) => {
      this.enCurso.delete(trabajo.id);
      this.actualizar(trabajo.id, cambios);
      this.refrescar(tarea.carpetaId);
      this.continuar();
    };
    trabajo.suscripcion = this.api.subir(tarea.carpetaId, tarea.ruta, trabajo.archivo, trabajo.politica).subscribe({
      next: (evento) => {
        if (evento.type === HttpEventType.UploadProgress) {
          this.actualizar(trabajo.id, { enviado: evento.loaded });
        } else if (evento.type === HttpEventType.Response) {
          const resultado = evento.body as ResultadoSubida;
          terminar({ estado: resultado.accion === 'omitido' ? 'omitido' : 'listo', enviado: tarea.tamano });
        }
      },
      error: (error) => terminar({ estado: 'error', error: mensajeDe(error) }),
    });
  }

  private actualizar(id: number, cambios: Partial<TareaSubida>) {
    this.tareas.update((tareas) => tareas.map((t) => (t.id === id ? { ...t, ...cambios } : t)));
  }

  // Varias subidas seguidas se juntan en un solo refresco del explorador y del árbol.
  private refrescar(carpetaId: number) {
    this.carpetasPorRefrescar.add(carpetaId);
    if (this.refresco) return;
    this.refresco = setTimeout(() => {
      this.refresco = null;
      const ids = this.carpetasPorRefrescar;
      this.carpetasPorRefrescar = new Set();
      this.eventos.carpetas(ids);
    }, 500);
  }
}
