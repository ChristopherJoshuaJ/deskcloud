import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Elemento } from './modelos';
import { SesionService } from './sesion.service';

export interface ContenidoPortapapeles {
  modo: 'cortar' | 'copiar';
  elementos: Elemento[];
  espacioId: number;
}

@Injectable({ providedIn: 'root' })
export class PortapapelesService {
  readonly contenido = signal<ContenidoPortapapeles | null>(null);
  readonly cortados = computed(() => {
    const c = this.contenido();
    return new Set(c?.modo === 'cortar' ? c.elementos.map((e) => e.id) : []);
  });

  constructor() {
    const sesion = inject(SesionService);
    effect(() => {
      if (!sesion.conectado()) this.contenido.set(null);
    });
  }

  poner(modo: 'cortar' | 'copiar', elementos: Elemento[]) {
    if (elementos.length === 0) return;
    this.contenido.set({ modo, elementos, espacioId: elementos[0].espacioId });
  }

  vaciar() {
    this.contenido.set(null);
  }
}

// Lo que se está arrastrando dentro de la app. Durante "dragover" el navegador no deja leer los
// datos del arrastre, así que se guardan aquí para decidir si se puede soltar.
@Injectable({ providedIn: 'root' })
export class ArrastreService {
  readonly arrastrando = signal<{ elementos: Elemento[]; espacioId: number } | null>(null);

  iniciar(evento: DragEvent, elementos: Elemento[]) {
    this.arrastrando.set({ elementos, espacioId: elementos[0].espacioId });
    if (evento.dataTransfer) {
      evento.dataTransfer.effectAllowed = 'copyMove';
      evento.dataTransfer.setData('application/x-deskcloud', elementos.map((e) => e.id).join(','));
      evento.dataTransfer.setData('text/plain', elementos.map((e) => e.nombre).join('\n'));
    }
  }

  terminar() {
    this.arrastrando.set(null);
  }

  // true si se puede soltar lo arrastrado en la carpeta destino (no en sí misma ni en su carpeta actual).
  sePuedeSoltarEn(destino: { id: number }, rutaDestino?: Set<number>) {
    const actual = this.arrastrando();
    if (!actual) return false;
    return actual.elementos.every((e) => e.id !== destino.id && e.padreId !== destino.id && !rutaDestino?.has(e.id));
  }

  static traeArchivos(evento: DragEvent) {
    return !!evento.dataTransfer && [...evento.dataTransfer.types].includes('Files');
  }
}
