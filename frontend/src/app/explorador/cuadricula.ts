import { Component, DestroyRef, ElementRef, afterNextRender, computed, inject } from '@angular/core';
import { Tooltip } from 'primeng/tooltip';
import { soltadoDesdeEquipo } from '../core/archivos-locales';
import { TamanoPipe } from '../core/formato';
import { Elemento } from '../core/modelos';
import { ExploradorEstado, NOMBRES_ORDEN } from './explorador-estado';
import { IconoElemento, Insignias, Renombrar } from './partes-elemento';

const ANCHO_MOSAICO = 132;
const SEPARACION = 8;

@Component({
  selector: 'dc-cuadricula',
  imports: [Tooltip, TamanoPipe, IconoElemento, Insignias, Renombrar],
  templateUrl: './cuadricula.html',
  styleUrl: './cuadricula.scss',
})
export class Cuadricula {
  readonly estado = inject(ExploradorEstado);
  readonly leer = soltadoDesdeEquipo;
  readonly nombresOrden = NOMBRES_ORDEN;
  readonly grupos = computed(() => [
    { tipo: 'CARPETA' as const, titulo: 'Carpetas', elementos: this.estado.carpetas() },
    { tipo: 'ARCHIVO' as const, titulo: 'Archivos', elementos: this.estado.archivos() },
  ]);

  constructor() {
    const host: HTMLElement = inject(ElementRef).nativeElement;
    // Cuántos mosaicos entran por fila: las flechas arriba y abajo saltan esa cantidad.
    const observador = new ResizeObserver(([entrada]) => {
      const ancho = entrada.contentRect.width - 24;
      this.estado.columnas.set(Math.max(1, Math.floor((ancho + SEPARACION) / (ANCHO_MOSAICO + SEPARACION))));
    });
    afterNextRender(() => observador.observe(host));
    inject(DestroyRef).onDestroy(() => observador.disconnect());
  }

  menu(evento: MouseEvent, elemento: Elemento) {
    evento.preventDefault();
    evento.stopPropagation();
    if (!this.estado.seleccion().has(elemento.id)) this.estado.seleccionarSolo(elemento.id);
    this.estado.abrirMenu(evento, elemento);
  }
}
