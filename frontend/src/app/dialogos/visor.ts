import { Component, computed, effect, inject, signal } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { Button } from 'primeng/button';
import { Dialog } from 'primeng/dialog';
import { Tooltip } from 'primeng/tooltip';
import { AccionesService } from '../core/acciones.service';
import { Api } from '../core/api.service';
import { DialogosService } from '../core/dialogos.service';
import { Elemento } from '../core/modelos';

// Vista previa a pantalla casi completa, con flechas para pasar al archivo anterior o siguiente.
@Component({
  selector: 'dc-visor',
  imports: [Dialog, Button, Tooltip],
  template: `
    <p-dialog
      closeAriaLabel="Cerrar"
      [visible]="!!actual()"
      (visibleChange)="!$event && cerrar()"
      [modal]="true"
      [draggable]="false"
      [resizable]="false"
      [dismissableMask]="true"
      [showHeader]="false"
      [style]="{ width: '92vw', height: '90vh' }"
      [contentStyle]="{ padding: 0, height: '100%', display: 'flex', 'flex-direction': 'column' }"
      (keydown.arrowleft)="mover(-1)"
      (keydown.arrowright)="mover(1)"
    >
      @if (actual(); as e) {
        <header>
          <span class="nombre" [title]="e.nombre">{{ e.nombre }}</span>
          @if (lista().length > 1) {
            <span class="dc-mono dc-secundario">{{ indice() + 1 }} / {{ lista().length }}</span>
          }
          <span class="espacio"></span>
          <p-button icon="pi pi-download" [text]="true" [rounded]="true" severity="secondary" pTooltip="Descargar" tooltipPosition="bottom" ariaLabel="Descargar" (onClick)="descargar(e)" />
          <p-button icon="pi pi-external-link" [text]="true" [rounded]="true" severity="secondary" pTooltip="Abrir en otra pestaña" tooltipPosition="bottom" ariaLabel="Abrir en otra pestaña" (onClick)="pestana(e)" />
          <p-button icon="pi pi-times" [text]="true" [rounded]="true" severity="secondary" ariaLabel="Cerrar" (onClick)="cerrar()" />
        </header>
        <div class="escenario">
          @if (lista().length > 1) {
            <button type="button" class="paso izquierda" (click)="mover(-1)" aria-label="Anterior"><i class="pi pi-chevron-left"></i></button>
            <button type="button" class="paso derecha" (click)="mover(1)" aria-label="Siguiente"><i class="pi pi-chevron-right"></i></button>
          }
          @switch (e.tipoVista) {
            @case ('imagen') {
              <img [src]="url()" [alt]="e.nombre" />
            }
            @case ('video') {
              <video [src]="url()" controls autoplay></video>
            }
            @case ('audio') {
              <div class="audio">
                <i class="pi pi-volume-up"></i>
                <audio [src]="url()" controls autoplay></audio>
              </div>
            }
            @default {
              <iframe [src]="urlSegura()" [title]="e.nombre"></iframe>
            }
          }
        </div>
      }
    </p-dialog>
  `,
  styles: `
    header { display: flex; align-items: center; gap: 10px; padding: 6px 8px 6px 16px; border-bottom: 1px solid var(--dc-divisor); flex: none; }
    .nombre { color: var(--dc-texto-destacado); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .espacio { flex: 1; }
    .escenario { flex: 1; min-height: 0; position: relative; display: flex; align-items: center; justify-content: center; background: #080b10; }
    img, video { max-width: 100%; max-height: 100%; object-fit: contain; }
    iframe { width: 100%; height: 100%; border: none; background: #fff; }
    .audio { display: flex; flex-direction: column; align-items: center; gap: 24px; .pi { font-size: 64px; color: var(--dc-carpeta); } audio { width: min(480px, 80vw); } }
    .paso { position: absolute; top: 50%; transform: translateY(-50%); z-index: 1; width: 44px; height: 44px; border-radius: 50%; border: none; cursor: pointer;
      background: rgba(15, 22, 32, 0.8); color: var(--dc-texto-destacado); &:hover { background: var(--dc-boton-activo); } }
    .izquierda { left: 12px; }
    .derecha { right: 12px; }
  `,
})
export class Visor {
  private readonly api = inject(Api);
  private readonly acciones = inject(AccionesService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly peticion = inject(DialogosService).visor;

  readonly lista = signal<Elemento[]>([]);
  readonly indice = signal(0);
  readonly actual = computed(() => (this.peticion.actual() ? (this.lista()[this.indice()] ?? null) : null));
  readonly url = computed(() => (this.actual() ? this.api.urlVista(this.actual()!.id) : ''));
  // Mismo origen y servido con nosniff (los textos llegan como text/plain), así que es seguro en un iframe.
  readonly urlSegura = computed(() => this.sanitizer.bypassSecurityTrustResourceUrl(this.url()));

  constructor() {
    effect(() => {
      const datos = this.peticion.actual()?.datos;
      if (!datos) return;
      const lista = datos.lista.length > 0 ? datos.lista : [datos.elemento];
      this.lista.set(lista);
      this.indice.set(Math.max(0, lista.findIndex((e) => e.id === datos.elemento.id)));
    });
  }

  mover(paso: number) {
    const total = this.lista().length;
    if (total > 1) this.indice.set((this.indice() + paso + total) % total);
  }

  descargar(e: Elemento) {
    this.acciones.descargar([e]);
  }

  pestana(e: Elemento) {
    window.open(this.api.urlVista(e.id), '_blank', 'noopener');
  }

  cerrar() {
    if (this.peticion.actual()) this.peticion.responder();
  }
}
